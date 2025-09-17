// --- Código principal: inicialização e configurações do mapa, barra lateral e QR Code ---

// Aguarda carregamento do DOM antes de inicializar
document.addEventListener("DOMContentLoaded", function () {
    // Formulário de busca
    const form = document.getElementById("searchForm");
    const enderecoInput = document.getElementById("endereco");

    if (form) {
        // Intercepta envio do formulário para evitar reload da página
        form.addEventListener("submit", function (ev) {
            ev.preventDefault();
            enderecoInput.blur();  // remove foco do input
            adicionarEndereco();   // executa função de busca personalizada
        });
    }

    // Elementos da interface: menu lateral e QR Code
    const botaoMenu = document.getElementById("botaoMenu");
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("overlay");
    const qrcodeContainer = document.getElementById("qrcode-container");
    const qrcodeExpander = document.getElementById("qrcode-expander");
    const qrcodeContent = document.getElementById("qrcode-content");
    const fecharQrCode = document.getElementById("fechar-qrcode");

    // Controle de abertura/fechamento do menu lateral
    botaoMenu.addEventListener("click", function () {
        sidebar.classList.toggle("aberto");
        overlay.classList.toggle("visivel");
    });

    // Fecha menu e QR Code ao clicar no overlay
    overlay.addEventListener("click", function () {
        sidebar.classList.remove("aberto");
        qrcodeContainer.classList.remove("aberto");
        qrcodeContent.classList.add("esconder");
        overlay.classList.remove("visivel");
    });
    
    // Expande o QR Code e gera o código
    qrcodeExpander.addEventListener("click", function() {
        if (!qrcodeContainer.classList.contains("aberto")) {
            qrcodeContainer.classList.add("aberto");
            qrcodeContent.classList.remove("esconder");
            gerarQRCode();
        }
    });

    // Fecha QR Code
    fecharQrCode.addEventListener("click", function() {
        qrcodeContainer.classList.remove("aberto");
        qrcodeContent.classList.add("esconder");
    });

    // Captura Enter no input de endereço
    if (enderecoInput) {
        enderecoInput.addEventListener("keypress", function(event) {
            if (event.key === "Enter") {
                event.preventDefault();
                adicionarEndereco();
            }
        });
    }

    // Carrega waypoints da URL
    carregarWaypointsDaUrl();
});

// Configuração da chave da API
const chave_api = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImE0NmE3ZjdkZGFiODQ0NGI4Y2Q3MmE3YjIyNWM3MTlkIiwiaCI6Im11cm11cjY0In0=";

// Funções de loading da interface
function showloadscreen() {
    document.getElementById("tela-carregamento").classList.remove("esconder");
}
function hideload() {
    document.getElementById("tela-carregamento").classList.add("esconder");
}

// Funções auxiliares para controle da trilha de rota
function startRouteTrail() {
  if (!map.hasLayer(routeTrail)) routeTrail.addTo(map);
  isTrailActive = true;
}
function hideRouteTrail() {
  if (map.hasLayer(routeTrail)) map.removeLayer(routeTrail);
  isTrailActive = false;
}
function clearRouteTrail() {
  routeTrailPoints = [];
  routeTrail.setLatLngs([]);
  if (map.hasLayer(routeTrail)) map.removeLayer(routeTrail);
  isTrailActive = false;
}

// Adiciona ponto à trilha apenas se ativa e respeitando distância mínima
function addPointToRouteTrail(latlng) {
  if (!isTrailActive) return;
  const last = routeTrailPoints.length ? routeTrailPoints[routeTrailPoints.length - 1] : null;
  if (!last || last.distanceTo(latlng) > TRAIL_MIN_DISTANCE) {
    routeTrailPoints.push(latlng);
    routeTrail.addLatLng(latlng);
  }
}

// Comparação de coordenadas com tolerância
function latLngEquals(a, b, tol = 1e-6) {
    return Math.abs(Number(a.lat) - Number(b.lat)) < tol && Math.abs(Number(a.lng) - Number(b.lng)) < tol;
}

// Calcula ângulo entre dois pontos geográficos
function calcularAnguloEntreDoisPontos(p1, p2) {
    const dx = p2.lng - p1.lng;
    const dy = p2.lat - p1.lat;
    const rad = Math.atan2(dy, dx);
    return (rad * 180) / Math.PI;
}

// Ícone do usuário no mapa
const userDivIcon = L.divIcon({
    className: "user-marker",
    html: `<div class="user-icon" style="transform: rotate(190deg);">
            <img src="./imagens/usuariomarker.png" width="32" height="32"/>
         </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
});

// Variáveis globais de controle de undo/redo, waypoints, rota e estado do mapa
let undoStack = [];
let redoStack = [];
let waypoints = [];
let waypointMarkers = [];
let userMarker = null;
let rotaLayer = null;
let rotaPolyline = null;
let instrucoesRota = [];
let proximaInstrucaoIndex = 0;
let recalculando = false;
let followUser = true;
let followTimeout;
let rotaInicialCarregada = false;

// Configurações para snap do usuário na rota e suavização
const SNAP_LOOKAHEAD = 18;   // metros à frente
const SNAP_SMOOTH_MS = 300;  // duração da animação
let _lastSnapTime = 0;
let _lastSnapLatLng = null;

// Inicialização do mapa
const map = L.map('map').setView([-23.5505, -46.6333], 13);
let routeTrailPoints = [];
let routeTrail = L.polyline(routeTrailPoints, { color: '#00c853', weight: 6, opacity: 0.9 });
let isTrailActive = false;
const TRAIL_MIN_DISTANCE = 0.8;
let userPath = L.polyline([], {color: 'gray', weight: 8}).addTo(map);

// Tiles OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
}).addTo(map);

// Funções de histórico de pesquisas
function salvarUltimaPesquisa(endereco) {
    let ultimas = JSON.parse(localStorage.getItem("ultimasPesquisas")) || [];
    ultimas = ultimas.filter(e => e !== endereco);  // remove duplicatas
    ultimas.unshift(endereco);
    ultimas = ultimas.slice(0, 3); // mantém últimas 3 pesquisas
    localStorage.setItem("ultimasPesquisas", JSON.stringify(ultimas));
}

// Animação de movimentação suave de marcador
function animateMarker(marker, toLatLng, duration = 1000) {
    const from = marker.getLatLng();
    const start = performance.now();
    function frame(now) {
        const progress = Math.min((now - start) / duration, 1);
        const lat = from.lat + (toLatLng.lat - from.lat) * progress;
        const lng = from.lng + (toLatLng.lng - from.lng) * progress;
        marker.setLatLng([lat, lng]);
        if (progress < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

// Função recursiva para "achatar" estruturas de LatLng em um array simples
function flattenLatLngs(latlngs) {
    const out = [];
    function walk(item) {
        if (!item) return;
        if (item.lat !== undefined && item.lng !== undefined) { out.push(item); return; }
        if (Array.isArray(item)) {
            if (item.length >= 2 && typeof item[0] === 'number' && typeof item[1] === 'number') {
                out.push(L.latLng(item[1], item[0]));
                return;
            }
            item.forEach(sub => walk(sub));
        }
    }
    walk(latlngs);
    return out;
}

// Calcula distância entre dois pontos geográficos
function calcularDistancia(ponto1, ponto2) {
    const toRad = (valor) => (valor * Math.PI) / 180;
    const lat1 = toRad(ponto1.lat), lon1 = toRad(ponto1.lng);
    const lat2 = toRad(ponto2.lat), lon2 = toRad(ponto2.lng);
    const R = 6371e3; // raio da Terra em metros
    const deltaLat = lat2 - lat1;
    const deltaLon = lon2 - lon1;
    const a = Math.sin(deltaLat / 2)**2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Coleta todos os pontos da rota ativa
function coletarPontosDaRota() {
    let pontos = [];
    if (rotaLayer) {
        rotaLayer.eachLayer(layer => {
            if (layer instanceof L.Polyline) {
                pontos = pontos.concat(flattenLatLngs(layer.getLatLngs()));
            }
        });
    } else if (rotaPolyline) {
        pontos = flattenLatLngs(rotaPolyline.getLatLngs());
    }
    return pontos;
}

// Calcula distância mínima do usuário até a polyline da rota
function distanciaMinimaPolyline(userLatLng, polylinePoints) {
    if (!polylinePoints || polylinePoints.length === 0) return { distance: Infinity, nearestLatLng: null, nearestIndex: -1 };

    // converte LatLng para pixels
    const layerPoints = polylinePoints.map(p => map.latLngToLayerPoint(L.latLng(p.lat, p.lng)));
    const userPoint = map.latLngToLayerPoint(userLatLng);

    // distância ponto-segmento
    function pointToSegmentDist(px, p1, p2) {
        const x = px.x, y = px.y;
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        if (dx === 0 && dy === 0) return Math.sqrt((x-p1.x)**2 + (y-p1.y)**2);
        let t = ((x - p1.x) * dx + (y - p1.y) * dy) / (dx*dx + dy*dy);
        t = Math.max(0, Math.min(1, t));
        const projX = p1.x + t*dx, projY = p1.y + t*dy;
        return Math.sqrt((x-projX)**2 + (y-projY)**2);
    }

    let minPix = Infinity, nearestIdx = -1, nearestProj = null;
    for (let i=0; i<layerPoints.length-1; i++) {
        const dPix = pointToSegmentDist(userPoint, layerPoints[i], layerPoints[i+1]);
        if (dPix < minPix) {
            minPix = dPix;
            nearestIdx = i;
            const dx = layerPoints[i+1].x - layerPoints[i].x;
            const dy = layerPoints[i+1].y - layerPoints[i].y;
            const denom = dx*dx + dy*dy;
            let t = denom!==0 ? ((userPoint.x-layerPoints[i].x)*dx + (userPoint.y-layerPoints[i].y)*dy)/denom : 0;
            t = Math.max(0, Math.min(1, t));
            nearestProj = L.point(layerPoints[i].x + dx*t, layerPoints[i].y + dy*t);
        }
    }

    if (!nearestProj) nearestProj = layerPoints[0], nearestIdx = 0;

    // converte pixels para metros
    const mp1 = map.layerPointToLatLng(L.point(0,0));
    const mp2 = map.layerPointToLatLng(L.point(1,0));
    const metersPerPixel = map.distance(mp1, mp2);

    return { distance: minPix*metersPerPixel, nearestLatLng: map.layerPointToLatLng(nearestProj), nearestIndex: nearestIdx };
}

// Interpolação linear entre dois pontos
function lerpLatLng(a, b, t) {
    return L.latLng(a.lat + (b.lat - a.lat)*t, a.lng + (b.lng - a.lng)*t);
}
// --------- Funções de cálculo e snap na rota ---------

// Avança ao longo de uma polyline a partir de um ponto de projeção
// pontos: array de {lat,lng}, startIndex: índice do segmento inicial
// startProjection: ponto inicial sobre a polyline
// advanceMeters: metros a avançar
// Retorna ponto interpolado, índice final e metros restantes
function pontoAvancadoNaPolyline(pontos, startIndex, startProjection, advanceMeters) {
    if (!pontos || pontos.length === 0) return { latlng: startProjection, arrivedIndex: startIndex, remainingMeters: 0 };

    let rem = advanceMeters;
    let idx = startIndex;
    let currentPoint = startProjection;
    let segEnd = pontos[startIndex + 1] || pontos[startIndex];
    let dToSegEnd = calcularDistancia(startProjection, segEnd);

    // Percorre segmentos até consumir advanceMeters
    while (rem > dToSegEnd && idx < pontos.length - 2) {
        rem -= dToSegEnd;
        idx++;
        currentPoint = pontos[idx];
        dToSegEnd = calcularDistancia(currentPoint, pontos[idx + 1]);
    }

    // Interpola ponto dentro do segmento atual
    if (rem <= dToSegEnd && dToSegEnd > 0) {
        const t = rem / dToSegEnd;
        const a = currentPoint, b = pontos[idx + 1];
        return { latlng: L.latLng(a.lat + (b.lat - a.lat) * t, a.lng + (b.lng - a.lng) * t), arrivedIndex: idx, remainingMeters: 0 };
    } else {
        // Se chegou ao fim da polyline
        const last = pontos[pontos.length - 1];
        return { latlng: L.latLng(last.lat, last.lng), arrivedIndex: pontos.length - 1, remainingMeters: rem - dToSegEnd };
    }
}

// Snap do usuário à rota com previsão
// userLatLng: posição atual do usuário
// pontos: array de pontos da rota
// options: { lookaheadMeters, smoothDuration }
function snapPredict(userLatLng, pontos, options = {}) {
    if (!pontos || pontos.length < 2 || !userLatLng) return null;
    const lookaheadMeters = options.lookaheadMeters || 18;

    const distObj = distanciaMinimaPolyline(userLatLng, pontos);
    const proj = distObj.nearestLatLng;
    const segIndex = distObj.nearestIndex >= 0 ? distObj.nearestIndex : 0;

    const avanc = pontoAvancadoNaPolyline(pontos, segIndex, proj, lookaheadMeters);
    const headingAvanc = pontoAvancadoNaPolyline(pontos, avanc.arrivedIndex, avanc.latlng, Math.max(6, lookaheadMeters / 3));

    return {
        projected: proj,
        snapPoint: avanc.latlng,
        snapIndex: avanc.arrivedIndex,
        headingPoint: headingAvanc.latlng,
        distanceToRoute: distObj.distance
    };
}

// Encontra o ponto mais próximo na rota
function encontrarProximoPontoNaRota(userLatLng, rotaPoints) {
    if (!rotaPoints || rotaPoints.length === 0) return { ponto: null, index: -1, distancia: Infinity };
    let ponto = null, menorDist = Infinity, menorIndex = -1;
    rotaPoints.forEach((p, idx) => {
        const d = calcularDistancia(userLatLng, p);
        if (d < menorDist) { menorDist = d; ponto = p; menorIndex = idx; }
    });
    return { ponto, index: menorIndex, distancia: menorDist };
}

// Atualiza a polyline restante da rota a partir de um índice
function atualizarRotaRestante(pontos, index) {
    if (!rotaPolyline || !Array.isArray(pontos)) return;
    const restante = pontos.slice(index);
    if (restante.length < 2) {
        if (rotaLayer) map.removeLayer(rotaLayer);
        rotaLayer = null;
        rotaPolyline = null;
        return;
    }
    try { rotaPolyline.setLatLngs(restante); } catch (e) { console.warn('Não foi possível atualizar rota restante:', e); }
}

// --------- Funções de Waypoints e UI ---------

// Desfaz a última adição do Waypoint
function desfazerWaypoint() {
    if (undoStack.length === 0) return;
    const acao = undoStack.pop();
    redoStack.push(acao);

    if (acao.tipo === "add") {
        removerWaypoint(waypoints.findIndex(wp => latLngEquals(wp, acao.latlng)), false);
    } else if (acao.tipo === "remove") {
        adicionarWaypoint(acao.latlng, false);
    }
}

// Refaz a última adição do Waypoint
function refazerWaypoint() {
    if (redoStack.length === 0) return;
    const acao = redoStack.pop();
    undoStack.push(acao);

    if (acao.tipo === "add") {
        adicionarWaypoint(acao.latlng, false);
    } else if (acao.tipo === "remove") {
        removerWaypoint(waypoints.findIndex(wp => latLngEquals(wp, acao.latlng)), false);
    }
}

// Atalhos de teclado para desfazer/refazer waypoint
document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.key.toLowerCase() === 'z') desfazerWaypoint();
    if (e.ctrlKey && e.key.toLowerCase() === 'y') refazerWaypoint();
});

// Exibe mensagem de sugestão ao usuário
function mostrarSugestao(texto) {
    const el = document.getElementById("texto-sugestao");
    if (el) el.innerText = texto;
}

// Otimiza ordem de waypoints para reduzir distância total
function reordenarWaypointsOtimizada(listaWaypoints) {
    if (listaWaypoints.length <= 1) return listaWaypoints;

    let rotaOtimizada = [];
    let pontosRestantes = [...listaWaypoints];
    let pontoAtual = pontosRestantes.shift(); 
    rotaOtimizada.push(pontoAtual);

    while (pontosRestantes.length > 0) {
        let proximoPonto = null, menorDistancia = Infinity, indexDoProximoPonto = -1;
        for (let i = 0; i < pontosRestantes.length; i++) {
            const distancia = calcularDistancia(pontoAtual, pontosRestantes[i]);
            if (distancia < menorDistancia) { menorDistancia = distancia; proximoPonto = pontosRestantes[i]; indexDoProximoPonto = i; }
        }
        if (proximoPonto) {
            rotaOtimizada.push(proximoPonto);
            pontoAtual = proximoPonto;
            pontosRestantes.splice(indexDoProximoPonto, 1);
        } else {
            rotaOtimizada = rotaOtimizada.concat(pontosRestantes);
            pontosRestantes = [];
        }
    }
    return rotaOtimizada;
}

// Atualiza URL com waypoints e gera QR Code
function atualizarUrlComWaypoints() {
    const novaUrl = new URL(window.location.href);
    novaUrl.searchParams.delete('waypoints'); // Limpa os parâmetros existentes para evitar duplicatas

    waypoints.forEach(p => {
        novaUrl.searchParams.append('waypoints', `${p.lat},${p.lng}`);
    });

    window.history.replaceState({}, '', novaUrl);
    gerarQRCode();
}   

// Carrega waypoints da URL
function carregarWaypointsDaUrl() {
    const params = new URLSearchParams(window.location.search);
    const coordsArray = params.getAll('waypoints');

    if (!coordsArray || coordsArray.length === 0) return;

    coordsArray.forEach(coord => {
        const [lat, lng] = coord.split(',').map(Number);
        if (!isNaN(lat) && !isNaN(lng)) {
            adicionarWaypoint({lat, lng});
        }
    });
}

// --------- Funções de QR Code ---------

function gerarQRCode() {
    const qrcodeElement = document.getElementById("qrcode");
    const content = document.getElementById("qrcode-content");

    if (!qrcodeElement || !content) return;

    qrcodeElement.innerHTML = "";

    const shareUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;

    new QRCode(qrcodeElement, {
        text: shareUrl,
        width: 220,
        height: 220,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });

    content.classList.remove("esconder");
}


// Adiciona um waypoint no mapa e atualiza UI
function adicionarWaypoint(latlng, registrarHistorico = true) {
    const p = { lat: Number(latlng.lat), lng: Number(latlng.lng) };
    if (waypoints.some(wp => latLngEquals(wp, p))) return;

    waypoints.push(p);
    const marker = L.marker([p.lat, p.lng], { draggable: true }).addTo(map);
    waypointMarkers.push(marker);
    const novoIndex = waypoints.findIndex(wp => latLngEquals(wp, p));

    marker.bindPopup(`<b>Waypoint</b><br><button class="btn-remover-popup" data-index="${novoIndex}">Remover</button>`);

    marker.on("popupopen", (e) => {
    const btn = e.popup.getElement().querySelector(`[data-index="${novoIndex}"]`);
    if (btn) btn.onclick = (e) => removerWaypoint(parseInt(e.target.dataset.index), true); // Adicione `true` para registrar no histórico
    });

    marker.on("dragend", function() {
        const newPos = marker.getLatLng();
        const idx = waypointMarkers.indexOf(marker);
        if (idx !== -1) {
            waypoints[idx] = { lat: newPos.lat, lng: newPos.lng };
            atualizarUrlComWaypoints();
            buscarERotear();
        }
    });

    if (registrarHistorico) {
        undoStack.push({ tipo: "add", latlng: p });
        redoStack = [];
    }

    if (userMarker) buscarERotear();
    atualizarUrlComWaypoints();
}

// Remove waypoint selecionado e atualiza rota e histórico
function removerWaypoint(index, registrarHistorico = true) {
    if (index < 0 || index >= waypoints.length) return;

    const removido = waypoints[index];
    const marker = waypointMarkers[index];

    if (marker && map.hasLayer(marker)) {
        map.removeLayer(marker);
    }

    waypointMarkers.splice(index, 1);
    waypoints.splice(index, 1);

    if (registrarHistorico) {
        undoStack.push({ tipo: "remove", latlng: removido, originalIndex: index });
        redoStack = [];
    }

    if (rotaLayer) {
        map.removeLayer(rotaLayer);
        rotaLayer = null;
        rotaPolyline = null;
    }

    if (waypoints.length > 0 && userMarker) {
        buscarERotear();
    } else {
        document.getElementById("qrcode-content")?.classList.add("esconder");
    }

    atualizarUrlComWaypoints();
}


// Consulta coordenadas de um endereço usando Nominatim
function buscarCoordenadas(endereco) {
    const query = encodeURIComponent(endereco);
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&extratags=1&limit=6&q=${query}`;
    return fetch(url)
        .then(res => { if (!res.ok) throw new Error(`Erro no geocoder: ${res.status}`); return res.json(); })
        .then(data => {
            if (!data || data.length === 0) throw new Error("Endereço não encontrado.");
            const inputLower = endereco.toLowerCase();
            const hasNumber = /\d+/.test(endereco);
            const scored = data.map(d => Object.assign({}, d, { score: scoreCandidate(d, inputLower, hasNumber) }))
                               .sort((a,b) => b.score - a.score);
            const best = scored[0];
            if (best.score < 30) console.warn('Baixa confiança no geocode:', scored.map(s => ({ name: s.display_name, score: s.score })));
            return { lat: Number(best.lat), lng: Number(best.lon), raw: best, alternatives: scored.slice(1,4) };
        });
}

// Calcula pontuação de um candidato do geocoder
function scoreCandidate(d, inputLower, hasNumber) {
    const ad = d.address || {};
    let s = 0;
    if (hasNumber && (ad.house_number || /\b\d+\b/.test(d.display_name))) s += 60;
    if (ad.road && inputLower.includes(ad.road.toLowerCase())) s += 30;
    if (ad.city && inputLower.includes(ad.city.toLowerCase())) s += 25;
    if (ad.town && inputLower.includes(ad.town.toLowerCase())) s += 20;
    if (ad.suburb && inputLower.includes(ad.suburb.toLowerCase())) s += 10;
    const poiKeywords = ['upa','hospital','pronto atendimento','pronto-atendimento','posto de saúde','clinica','clínica','posto'];
    if (d.class === 'amenity' && poiKeywords.some(k => inputLower.includes(k))) s += 40;
    if ((d.display_name || '').toLowerCase().split(',').some(p => poiKeywords.some(k => p.includes(k)))) s += 20;
    if (d.osm_type === 'node') s += 10;
    if (d.boundingbox) { const bb = d.boundingbox.map(Number); if (Math.abs((bb[2]-bb[0])*(bb[3]-bb[1])) < 0.001) s += 10; }
    return s;
}

// --------- Funções de input e busca de endereço ---------

// Adiciona endereço digitado pelo usuário como waypoint
function adicionarEndereco() {
    const endereco = document.getElementById('endereco').value;
    if (!endereco) { alert("Por favor, digite um endereço."); return; }
    salvarUltimaPesquisa(endereco);
    showloadscreen();
    buscarCoordenadas(endereco)
        .then(({ lat, lng, alternatives }) => {
            adicionarWaypoint({ lat, lng });
            // Mostra alternativas temporárias
            alternatives.forEach(a => {
                const circle = L.circleMarker([a.lat, a.lon], { radius: 6, weight: 1, opacity: 0.8 }).addTo(map);
                circle.bindPopup(`Alternativa: ${a.display_name} (score ${a.score})`);
                setTimeout(() => { if (map.hasLayer(circle)) map.removeLayer(circle); }, 7000);
            });
            map.panTo([lat, lng]);
        })
        .catch(error => { alert(error.message || "Erro ao buscar endereço."); console.error(error); })
        .finally(() => hideload());
}

// Sugestões automáticas enquanto digita no input
const input = document.getElementById("endereco");
input.addEventListener("input", function() {
    const query = input.value.trim();
    const container = document.getElementById("sugestoes-proximas");
    if (!container) return;
    if (query.length < 3) { container.innerHTML = ""; return; }

    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`)
        .then(res => res.json())
        .then(data => {
            container.innerHTML = "";
            data.forEach(d => {
                const btn = document.createElement("button");
                btn.className = "btn-sugestao";
                btn.innerText = d.display_name;
                btn.onclick = () => {
                    input.value = d.display_name;
                    adicionarWaypoint({ lat: Number(d.lat), lng: Number(d.lon) });
                };
                container.appendChild(btn);
            });
        });
});

// --------- Geolocalização do usuário e atualização de rota ---------
if (navigator.geolocation) {
    showloadscreen();
    navigator.geolocation.watchPosition(pos => {
        const userLatLng = L.latLng(pos.coords.latitude, pos.coords.longitude);

        if (!userMarker) {
            userMarker = L.marker(userLatLng, { icon: userDivIcon }).addTo(map);
            hideload();
            map.setView(userLatLng, 15);
            if (waypoints.length > 0 && !rotaInicialCarregada) {
                buscarERotear();
                rotaInicialCarregada = true;
            }
            return;
        }

        // Atualiza posição do marcador e centraliza mapa suavemente
        userMarker.setLatLng(userLatLng);
        map.panTo(userLatLng, { animate: true, duration: 0.25 });

        // Se não há rota, tenta recalcular se há waypoints
        if (!rotaPolyline) {
            if (waypoints.length > 0 && !recalculando) {
                recalculando = true;
                mostrarSugestao("Recalculando rota...");
                buscarERotear().finally(() => { recalculando = false; });
            }
            return;
        }

        const pontos = coletarPontosDaRota();
        if (!pontos || pontos.length === 0) return;

        const distObj = distanciaMinimaPolyline(userLatLng, pontos);
        const THRESHOLD_METROS = 30;

        if (distObj.distance > THRESHOLD_METROS) {
            // Usuário se desviou da rota
            if (!recalculando && waypoints.length > 0) {
                recalculando = true;
                mostrarSugestao("Você se desviou — recalculando rota...");
                buscarERotear().finally(() => { recalculando = false; setTimeout(()=>{}, 500); });
            }
        } else {
            // Snap preditivo e atualização de trail
            const snapInfo = snapPredict(userLatLng, pontos, { lookaheadMeters: SNAP_LOOKAHEAD });
            if (snapInfo && snapInfo.distanceToRoute <= THRESHOLD_METROS) {
                if (!isTrailActive) startRouteTrail();
                animateMarker(userMarker, snapInfo.snapPoint, SNAP_SMOOTH_MS);
                addPointToRouteTrail(snapInfo.snapPoint);
                const angulo = calcularAnguloEntreDoisPontos(snapInfo.snapPoint, snapInfo.headingPoint);
                const iconDiv = userMarker.getElement?.()?.querySelector?.('.user-icon');
                if (iconDiv) iconDiv.style.transform = `rotate(${angulo}deg)`;
                atualizarRotaRestante(pontos, snapInfo.snapIndex);
            } else if (isTrailActive) {
                hideRouteTrail();
            }
        }
    }, erro => { alert("Não foi possível obter sua localização."); hideload(); }, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000
    });
} else {
    alert("Navegador não suporta geolocalização.");
    hideload();
}

// Adiciona waypoint ao clicar no mapa
map.on('click', e => adicionarWaypoint(e.latlng));

// Mostra instruções da rota local
function _postProcessarRotaLocal() {
    try {
        if (instrucoesRota?.length > 0) mostrarSugestao(instrucoesRota[0].instruction || "Siga em frente");
        else mostrarSugestao("Rota calculada, sem instruções detalhadas.");
    } catch (e) {
        console.warn("Debug: erro em _postProcessarRotaLocal", e);
        mostrarSugestao("Rota calculada.");
    }
}

// --------- Otimização de rota ---------

// Calcula distância total de uma rota (soma de segmentos)
function rotaDistancia(route) {
    let s = 0;
    for (let i = 0; i < route.length - 1; i++) s += calcularDistancia(route[i], route[i+1]);
    return s;
}

// Algoritmo 2-opt para melhorar rota localmente
function twoOpt(route) {
    if (!Array.isArray(route) || route.length < 3) return route.slice();
    let best = route.slice(), improved = true, iter = 0, maxIter = 500;
    while (improved && iter < maxIter) {
        improved = false;
        iter++;
        const n = best.length;
        for (let i = 0; i < n - 2; i++) {
            for (let k = i + 1; k < n - 1; k++) {
                const newRoute = best.slice(0,i+1).concat(best.slice(i+1,k+1).reverse()).concat(best.slice(k+1));
                if (rotaDistancia(newRoute) + 1e-6 < rotaDistancia(best)) { best = newRoute; improved = true; }
            }
            if (improved) break;
        }
    }
    return best;
}

// Reordena waypoints otimizando distância (opcional startPoint e 2-opt)
function reordenarWaypointsOtimizada(listaWaypoints, startPoint = null, aplicar2opt = true) {
    if (!Array.isArray(listaWaypoints) || listaWaypoints.length <= 1) return listaWaypoints.slice();
    const restantes = listaWaypoints.map(p => ({ lat: Number(p.lat), lng: Number(p.lng) }));
    const rota = [];
    let atual = startPoint?.lat !== undefined && startPoint?.lng !== undefined
        ? { lat: Number(startPoint.lat), lng: Number(startPoint.lng) }
        : restantes.shift();
    rota.push(atual);

    while (restantes.length > 0) {
        let idxNearest = 0, minD = calcularDistancia(atual, restantes[0]);
        for (let i = 1; i < restantes.length; i++) {
            const d = calcularDistancia(atual, restantes[i]);
            if (d < minD) { minD = d; idxNearest = i; }
        }
        const next = restantes.splice(idxNearest,1)[0];
        rota.push(next);
        atual = next;
    }

    return (aplicar2opt && rota.length > 2) ? twoOpt(rota) : rota;
}

// --------- Função principal para buscar rota ---------
async function buscarERotear() {
    recalculando = true;
    showloadscreen();

    if (!userMarker) { hideload(); recalculando=false; mostrarSugestao("Aguardando sua localização..."); return; }
    if (waypoints.length === 0) { hideload(); if (rotaLayer) map.removeLayer(rotaLayer); rotaLayer = rotaPolyline = null; mostrarSugestao("Adicione waypoints para traçar a rota."); return; }

    const waypointsOtimizados = reordenarWaypointsOtimizada(waypoints, userMarker.getLatLng(), true);
    const coordenadas = [userMarker.getLatLng(), ...waypointsOtimizados].map(wp => `${wp.lng},${wp.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordenadas}?overview=full&alternatives=false&steps=true&geometries=geojson`;

    try {
        const resposta = await fetch(url);
        if (!resposta.ok) throw new Error(`Erro HTTP: ${resposta.status}`);
        const dados = await resposta.json();
        const rota = dados.routes[0];
        if (rota) {
            if (rotaLayer) map.removeLayer(rotaLayer);
            if (rotaPolyline) map.removeLayer(rotaPolyline);
            const polyline = rota.geometry.coordinates.map(coord => [coord[1], coord[0]]);
            rotaPolyline = L.polyline(polyline, { color: 'blue', weight: 6 });
            rotaLayer = L.layerGroup().addTo(map);
            rotaLayer.addLayer(rotaPolyline);
            map.fitBounds(rotaPolyline.getBounds());
            instrucoesRota = [];
            rota.legs.forEach(leg => { if (leg.steps) instrucoesRota = instrucoesRota.concat(leg.steps); });
            proximaInstrucaoIndex = 0;
            _postProcessarRotaLocal();
        }
    } catch (erro) {
        console.error("Erro ao traçar a rota:", erro);
        mostrarSugestao("Não foi possível traçar a rota. Tente novamente.");
    } finally {
        hideload();
        recalculando = false;
    }
}