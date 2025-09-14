// --- Início do seu código com as correções ---

// Barra lateral e QR Code
document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("searchForm");
    const enderecoInput = document.getElementById("endereco");

    if (form) {
        form.addEventListener("submit", function (ev) {
        ev.preventDefault();     // evita reload / envio tradicional
        // opcional: remover focos para fechar teclado mais rápido
        enderecoInput.blur();
        // executa sua função de busca
        adicionarEndereco();
        });
    }
    const botaoMenu = document.getElementById("botaoMenu");
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("overlay");
    const qrcodeContainer = document.getElementById("qrcode-container");
    const qrcodeExpander = document.getElementById("qrcode-expander");
    const qrcodeContent = document.getElementById("qrcode-content");
    const fecharQrCode = document.getElementById("fechar-qrcode");

    botaoMenu.addEventListener("click", function () {
        sidebar.classList.toggle("aberto");
        overlay.classList.toggle("visivel");
    });

    overlay.addEventListener("click", function () {
        sidebar.classList.remove("aberto");
        qrcodeContainer.classList.remove("aberto");
        qrcodeContent.classList.add("esconder");
        overlay.classList.remove("visivel");
    });
    
    qrcodeExpander.addEventListener("click", function() {
        if (!qrcodeContainer.classList.contains("aberto")) {
            qrcodeContainer.classList.add("aberto");
            qrcodeContent.classList.remove("esconder");
            gerarQRCode();
        }
    });

    fecharQrCode.addEventListener("click", function() {
        qrcodeContainer.classList.remove("aberto");
        qrcodeContent.classList.add("esconder");
    });

    if (enderecoInput) {
        enderecoInput.addEventListener("keypress", function(event) {
            if (event.key === "Enter") {
                event.preventDefault();
                adicionarEndereco();
            }
        });
    }

    carregarWaypointsDaUrl();
    atualizarSugestoes();
});

// Configuração de chave
const chave_api = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImE0NmE3ZjdkZGFiODQ0NGI4Y2Q3MmE3YjIyNWM3MTlkIiwiaCI6Im11cm11cjY0In0=";

// Loading
function showloadscreen() {
    document.getElementById("tela-carregamento").classList.remove("esconder");
}
function hideload() {
    document.getElementById("tela-carregamento").classList.add("esconder");
}

// Helpers
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

// adiciona ponto ao trail (somente se ativo)
function addPointToRouteTrail(latlng) {
  if (!isTrailActive) return;
  const last = routeTrailPoints.length ? routeTrailPoints[routeTrailPoints.length - 1] : null;
  if (!last || last.distanceTo(latlng) > TRAIL_MIN_DISTANCE) {
    routeTrailPoints.push(latlng);
    routeTrail.addLatLng(latlng);
  }
}

function latLngEquals(a, b, tol = 1e-6) {
    return Math.abs(Number(a.lat) - Number(b.lat)) < tol && Math.abs(Number(a.lng) - Number(b.lng)) < tol;
}

function calcularAnguloEntreDoisPontos(p1, p2) {
    const dx = p2.lng - p1.lng;
    const dy = p2.lat - p1.lat;
    const rad = Math.atan2(dy, dx);
    const deg = (rad * 180) / Math.PI;
    return deg;
}

const userDivIcon = L.divIcon({
    className: "user-marker",
    html: `<div class="user-icon" style="transform: rotate(190deg);">
            <img src="./imagens/usuariomarker.png" width="32" height="32"/>
         </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
});

// Variáveis globais
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
// SNAP & controle contra jitter
const SNAP_LOOKAHEAD = 18;   // metros à frente para prever o snap (ajuste)
const SNAP_SMOOTH_MS = 300;  // duração da animação do snap
let _lastSnapTime = 0;
let _lastSnapLatLng = null;


const map = L.map('map').setView([-23.5505, -46.6333], 13);
let routeTrailPoints = [];
let routeTrail = L.polyline(routeTrailPoints, {
  color: '#00c853', weight: 6, opacity: 0.9
});
let isTrailActive = false;
const TRAIL_MIN_DISTANCE = 0.8;
let userPath = L.polyline([], {color: 'gray', weight: 8}).addTo(map);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
}).addTo(map);

// Pesquisas
function salvarUltimaPesquisa(endereco) {
    let ultimas = JSON.parse(localStorage.getItem("ultimasPesquisas")) || [];
    ultimas = ultimas.filter(e => e !== endereco);
    ultimas.unshift(endereco);
    ultimas = ultimas.slice(0, 3);
    localStorage.setItem("ultimasPesquisas", JSON.stringify(ultimas));
    atualizarSugestoes();
}

function atualizarSugestoes() {
    const ultimas = JSON.parse(localStorage.getItem("ultimasPesquisas")) || [];
    const container = document.getElementById("sugestoes-ultimas");
    if (!container) return;
    container.innerHTML = "";
    ultimas.forEach(endereco => {
        const btn = document.createElement("button");
        btn.className = "btn-sugestao";
        btn.innerText = endereco;
        btn.onclick = () => {
            document.getElementById("endereco").value = endereco;
            adicionarEndereco();
        };
        container.appendChild(btn);
    });
}

// Funções auxiliares de rota e mapa
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
            return;
        }
    }
    walk(latlngs);
    return out;
}

function calcularDistancia(ponto1, ponto2) {
    const toRad = (valor) => (valor * Math.PI) / 180;
    const lat1 = toRad(ponto1.lat);
    const lon1 = toRad(ponto1.lng);
    const lat2 = toRad(ponto2.lat);
    const lon2 = toRad(ponto2.lng);
    const R = 6371e3; // Raio da Terra em metros
    const deltaLat = lat2 - lat1;
    const deltaLon = lon2 - lon1;
    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) *
        Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

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

// -------- util: distancia mínima do ponto até a polyline (em metros) --------
function distanciaMinimaPolyline(userLatLng, polylinePoints) {
    if (!polylinePoints || polylinePoints.length === 0) return { distance: Infinity, nearestLatLng: null, nearestIndex: -1 };

    // converte todos os latlngs para pontos de camada (pixels)
    const layerPoints = polylinePoints.map(p => map.latLngToLayerPoint(L.latLng(p.lat, p.lng)));
    const userPoint = map.latLngToLayerPoint(userLatLng);

    // função para distância ponto-segmento em pixels
    function pointToSegmentDist(px, p1, p2) {
        const x = px.x, y = px.y;
        const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
        const dx = x2 - x1;
        const dy = y2 - y1;
        if (dx === 0 && dy === 0) {
            const dx0 = x - x1, dy0 = y - y1;
            return Math.sqrt(dx0*dx0 + dy0*dy0);
        }
        const t = ((x - x1) * dx + (y - y1) * dy) / (dx*dx + dy*dy);
        const tClamped = Math.max(0, Math.min(1, t));
        const projX = x1 + tClamped * dx;
        const projY = y1 + tClamped * dy;
        const ddx = x - projX, ddy = y - projY;
        return Math.sqrt(ddx*ddx + ddy*ddy);
    }

    let minPix = Infinity;
    let nearestIdx = -1;
    let nearestProj = null;

    for (let i = 0; i < layerPoints.length - 1; i++) {
        const p1 = layerPoints[i], p2 = layerPoints[i+1];
        const dPix = pointToSegmentDist(userPoint, p1, p2);
        if (dPix < minPix) {
            minPix = dPix;
            nearestIdx = i;
            // calcular projeção (recalcula t)
            const dx = p2.x - p1.x, dy = p2.y - p1.y;
            const denom = dx*dx + dy*dy;
            let t = 0;
            if (denom !== 0) t = ((userPoint.x - p1.x) * dx + (userPoint.y - p1.y) * dy) / denom;
            t = Math.max(0, Math.min(1, t));
            nearestProj = L.point(p1.x + dx*t, p1.y + dy*t);
        }
    }

    if (nearestProj === null) {
        // fallback: usar primeiro ponto
        nearestProj = layerPoints[0];
        nearestIdx = 0;
    }

    // converte pix -> metros: obtenha metros por pixel no mapa atual
    const mp1 = map.layerPointToLatLng(L.point(0,0));
    const mp2 = map.layerPointToLatLng(L.point(1,0));
    const metersPerPixel = map.distance(mp1, mp2);

    const distanceMeters = minPix * metersPerPixel;
    const nearestLatLng = map.layerPointToLatLng(nearestProj);

    return { distance: distanceMeters, nearestLatLng, nearestIndex: nearestIdx };
}

// retorna um ponto interpolado entre a e b, dado t [0..1]
function lerpLatLng(a, b, t) {
    return L.latLng(a.lat + (b.lat - a.lat) * t, a.lng + (b.lng - a.lng) * t);
}

// avança ao longo da polyline (array de {lat,lng}) a partir de um ponto de projeção
// startIndex = índice do segmento (pontos[startIndex] -> pontos[startIndex+1])
// startProjection = L.LatLng da projeção inicial (ponto sobre a polyline)
// advanceMeters = quantos metros avançar a partir da projection
// retorna { latlng: L.LatLng, arrivedIndex, remainingMeters: number }
function pontoAvancadoNaPolyline(pontos, startIndex, startProjection, advanceMeters) {
    if (!pontos || pontos.length === 0) return { latlng: startProjection, arrivedIndex: startIndex, remainingMeters: 0 };

    // distância do projection até o fim do segmento startIndex
    const segEnd = pontos[startIndex + 1] || pontos[startIndex];
    let rem = advanceMeters;
    // distância da proj no segmento até segEnd
    let dToSegEnd = calcularDistancia(startProjection, segEnd);

    let idx = startIndex;
    let currentPoint = startProjection;

    // se já avançou até o fim do segmento:
    while (rem > dToSegEnd && idx < pontos.length - 2) {
        rem -= dToSegEnd;
        idx++;
        currentPoint = pontos[idx];
        dToSegEnd = calcularDistancia(currentPoint, pontos[idx + 1]);
    }

    // se ficou dentro do segmento atual (idx)
    if (rem <= dToSegEnd && dToSegEnd > 0) {
        // interpolação t entre currentPoint e pontos[idx+1]
        const total = dToSegEnd;
        // queremos um ponto a 'rem' metros após currentPoint
        // compute fraction along segment from currentPoint to segEnd:
        const t = rem / total;
        const a = currentPoint;
        const b = pontos[idx + 1];
        const lat = a.lat + (b.lat - a.lat) * t;
        const lng = a.lng + (b.lng - a.lng) * t;
        return { latlng: L.latLng(lat, lng), arrivedIndex: idx, remainingMeters: 0 };
    } else {
        // chegamos no fim da polyline
        const last = pontos[pontos.length - 1];
        return { latlng: L.latLng(last.lat, last.lng), arrivedIndex: pontos.length - 1, remainingMeters: rem - dToSegEnd };
    }
}

// Função principal de snap + previsão
// userLatLng: posição real do usuário
// pontos: array de pontos da rota (como retornado por coletarPontosDaRota())
// options: { lookaheadMeters, smoothDuration }
function snapPredict(userLatLng, pontos, options = {}) {
    if (!pontos || pontos.length < 2 || !userLatLng) return null;
    const lookaheadMeters = options.lookaheadMeters || 18; // ajuste fino aqui
    // usa a função que você já tem — retorna nearestIndex (indice do segmento) e nearestLatLng (projeção)
    const distObj = distanciaMinimaPolyline(userLatLng, pontos);
    const proj = distObj.nearestLatLng;
    const segIndex = distObj.nearestIndex >= 0 ? distObj.nearestIndex : 0;

    // pega ponto avançado a partir da projeção
    const avanc = pontoAvancadoNaPolyline(pontos, segIndex, proj, lookaheadMeters);

    // também calcula um ponto um pouco à frente para definir o heading (mais lookahead curto)
    const headingAvanc = pontoAvancadoNaPolyline(pontos, avanc.arrivedIndex, avanc.latlng, Math.max(6, lookaheadMeters / 3));

    return {
        projected: proj,
        snapPoint: avanc.latlng,
        snapIndex: avanc.arrivedIndex,
        headingPoint: headingAvanc.latlng,
        distanceToRoute: distObj.distance
    };
}


function encontrarProximoPontoNaRota(userLatLng, rotaPoints) {
    if (!rotaPoints || rotaPoints.length === 0) return { ponto: null, index: -1, distancia: Infinity };
    let ponto = null, menorDist = Infinity, menorIndex = -1;
    rotaPoints.forEach((p, idx) => {
        const d = calcularDistancia(userLatLng, p);
        if (d < menorDist) { menorDist = d; ponto = p; menorIndex = idx; }
    });
    return { ponto, index: menorIndex, distancia: menorDist };
}

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

// Funções de Waypoint e UI
document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        desfazerWaypoint();
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        refazerWaypoint();
    }
});

function mostrarSugestao(texto) {
    const el = document.getElementById("texto-sugestao");
    if (el) el.innerText = texto;
}

// ✅ Função que realiza a otimização da rota
function reordenarWaypointsOtimizada(listaWaypoints) {
    if (listaWaypoints.length <= 1) {
        return listaWaypoints;
    }

    let rotaOtimizada = [];
    let pontosRestantes = [...listaWaypoints];
    
    // Inicia a rota com o primeiro ponto
    let pontoAtual = pontosRestantes.shift(); 
    rotaOtimizada.push(pontoAtual);

    while (pontosRestantes.length > 0) {
        let proximoPonto = null;
        let menorDistancia = Infinity;
        let indexDoProximoPonto = -1;

        for (let i = 0; i < pontosRestantes.length; i++) {
            const distancia = calcularDistancia(pontoAtual, pontosRestantes[i]);
            if (distancia < menorDistancia) {
                menorDistancia = distancia;
                proximoPonto = pontosRestantes[i];
                indexDoProximoPonto = i;
            }
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

// Funções para salvar e carregar waypoints da URL
function atualizarUrlComWaypoints() {
    const coordsString = waypoints.map(p => `${p.lat},${p.lng}`).join(';');
    const novaUrl = new URL(window.location.href);
    if (coordsString) {
        novaUrl.searchParams.set('waypoints', coordsString);
    } else {
        novaUrl.searchParams.delete('waypoints');
    }
    window.history.replaceState({}, '', novaUrl);
    gerarQRCode();
}

function carregarWaypointsDaUrl() {
    const params = new URLSearchParams(window.location.search);
    const coordsString = params.get('waypoints') || params.get('wps');
    if (!coordsString) return;
    const coordsArray = coordsString.split(';').map(s => s.trim()).filter(Boolean);
    coordsArray.forEach(coord => {
        const [lat, lng] = coord.split(',').map(Number);
        if (!isNaN(lat) && !isNaN(lng)) {
            adicionarWaypoint({lat, lng});
        }
    });
}

// Funções de geração e controle do QR Code
function gerarQRCode() {
    const qrcodeElement = document.getElementById("qrcode");
    const content = document.getElementById("qrcode-content");
    if (qrcodeElement && content) {
        qrcodeElement.innerHTML = '';
        const urlDaRota = window.location.href;
        new QRCode(qrcodeElement, urlDaRota);
        content.classList.remove("esconder");
    }
}

function adicionarWaypoint(latlng) {
    const p = { lat: Number(latlng.lat), lng: Number(latlng.lng) };
    if (waypoints.some(wp => latLngEquals(wp, p))) return;

    waypoints.push(p);
    const marker = L.marker([p.lat, p.lng], { draggable: true }).addTo(map);
    waypointMarkers.push(marker);

    const novoIndex = waypoints.findIndex(wp => latLngEquals(wp, p));

    marker.bindPopup(`
        <b>Waypoint</b><br>
        <button class="btn-remover-popup" data-index="${novoIndex}">Remover</button>
    `);

    marker.on("popupopen", (e) => {
        const btn = e.popup.getElement().querySelector(`[data-index="${novoIndex}"]`);
        if (btn) {
            btn.onclick = (e) => {
                const indexParaRemover = parseInt(e.target.dataset.index);
                removerWaypoint(indexParaRemover);
            };
        }
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

    if (userMarker) {
        buscarERotear();
    } else {
        mostrarSugestao("Aguardando sua localização para traçar a rota...");
    }
    atualizarUrlComWaypoints();
}

function removerWaypoint(index, registrarHistorico = true) {
    if (index < 0 || index >= waypoints.length) return;

    const removido = waypoints[index];
    const marker = waypointMarkers[index];

    if (marker && map.hasLayer(marker)) map.removeLayer(marker);
    waypointMarkers.splice(index, 1);
    waypoints.splice(index, 1);

    if (registrarHistorico) {
        undoStack.push({ tipo: "remove", latlng: removido, index });
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
        const qrc = document.getElementById("qrcode-content");
        if (qrc) qrc.classList.add("esconder");
    }

    atualizarUrlComWaypoints();
}

function buscarCoordenadas(endereco) {
    const query = encodeURIComponent(endereco);
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&extratags=1&limit=6&q=${query}`;
    return fetch(url)
        .then(res => {
            if (!res.ok) throw new Error(`Erro no geocoder: ${res.status}`);
            return res.json();
        })
        .then(data => {
            if (!data || data.length === 0) throw new Error("Endereço não encontrado.");
            const inputLower = endereco.toLowerCase();
            const hasNumber = /\d+/.test(endereco);
            const scored = data.map(d => {
                return Object.assign({}, d, { score: scoreCandidate(d, inputLower, hasNumber) });
            }).sort((a, b) => b.score - a.score);
            const best = scored[0];
            if (best.score < 30) {
                console.warn('Baixa confiança no geocode:', scored.map(s => ({ name: s.display_name, score: s.score })));
            }
            return {
                lat: Number(best.lat),
                lng: Number(best.lon),
                raw: best,
                alternatives: scored.slice(1, 4)
            };
        });
}

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
    if (d.boundingbox) {
        const bb = d.boundingbox.map(Number);
        const area = Math.abs((bb[2] - bb[0]) * (bb[3] - bb[1]));
        if (area < 0.001) s += 10;
    }
    if (d.importance) s += Math.round(d.importance * 10);
    if ((d.display_name || '').toLowerCase() === inputLower) s += 50;
    return s;
}

function adicionarEndereco() {
    const endereco = document.getElementById('endereco').value;
    if (!endereco) {
        alert("Por favor, digite um endereço.");
        return;
    }
    salvarUltimaPesquisa(endereco);
    showloadscreen();
    buscarCoordenadas(endereco)
        .then(({ lat, lng, alternatives }) => {
            adicionarWaypoint({ lat, lng });
            alternatives.forEach(a => {
                const circle = L.circleMarker([a.lat, a.lon], { radius: 6, weight: 1, opacity: 0.8 }).addTo(map);
                circle.bindPopup(`Alternativa: ${a.display_name} (score ${a.score})`);
                setTimeout(() => {
                    if (map.hasLayer(circle)) map.removeLayer(circle);
                }, 7000);
            });
            map.panTo([lat, lng]);
        })
        .catch(error => {
            alert(error.message || "Erro ao buscar endereço.");
            console.error(error);
        })
        .finally(() => hideload());
}

const input = document.getElementById("endereco");
input.addEventListener("input", function() {
    const query = input.value.trim();
    const container = document.getElementById("sugestoes-proximas");
    if (!container) return;
    if (query.length < 3) {
        container.innerHTML = "";
        return;
    }
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

if (navigator.geolocation) {
    showloadscreen();
    navigator.geolocation.watchPosition(pos => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const userLatLng = L.latLng(lat, lon);

        if (!userMarker) {
            userMarker = L.marker(userLatLng, {icon: userDivIcon}).addTo(map);
            hideload();
            map.setView(userLatLng, 15);
            if (waypoints.length > 0 && !rotaInicialCarregada) {
                buscarERotear();
                rotaInicialCarregada = true;
            }
            return;
        }

        // Atualiza posição do marcador (sempre)
        userMarker.setLatLng(userLatLng);
        // sempre centraliza o aviãozinho no centro da tela (animação suave)
        map.panTo(userLatLng, { animate: true, duration: 0.25 });


        // Se não há rota desenhada, apenas sai
        if (!rotaPolyline) {
            // Mas, se já temos waypoints e não estamos recalculando, tenta traçar rota
            if (waypoints.length > 0 && !recalculando) {
                recalculando = true;
                mostrarSugestao("Recalculando rota...");
                buscarERotear().finally(() => { recalculando = false; });
            }
            return;
        }

        // Coleta pontos da rota (array com {lat,lng})
        const pontos = coletarPontosDaRota();
        if (!pontos || pontos.length === 0) return;

        // Calcula distancia mínima do usuário até a polyline (em metros)
        const distObj = distanciaMinimaPolyline(userLatLng, pontos);

        // threshold em metros para considerar "desvio"
        const THRESHOLD_METROS = 30;

        if (distObj.distance > THRESHOLD_METROS) {
            // usuário saiu da rota
            if (!recalculando && waypoints.length > 0) {
                recalculando = true;
                mostrarSugestao("Você se desviou — recalculando rota...");
                // chama buscarERotear e garante que recalculando só volta a false quando terminar
                buscarERotear().finally(() => { 
                    recalculando = false;
                    // pequena pausa antes de permitir novo recálculo
                    setTimeout(()=>{ /* nada */ }, 500);
                });
            }
        } else {
                // Ainda próximo o suficiente -> fazemos snap preditivo + trail
                const snapInfo = snapPredict(userLatLng, pontos, { lookaheadMeters: SNAP_LOOKAHEAD });

                if (snapInfo) {
                    // se estiver perto o suficiente, garantir trail ativo
                    if (snapInfo.distanceToRoute <= THRESHOLD_METROS) {
                        if (!isTrailActive) startRouteTrail();       // mostra trail quando começa a seguir
                        // anima até ponto previsto e registra no trail
                        animateMarker(userMarker, snapInfo.snapPoint, SNAP_SMOOTH_MS);
                        addPointToRouteTrail(snapInfo.snapPoint);
                        // orienta o avião para a headingPoint
                        const angulo = calcularAnguloEntreDoisPontos(snapInfo.snapPoint, snapInfo.headingPoint);
                        const el = userMarker.getElement && userMarker.getElement();
                        const iconDiv = el && el.querySelector && el.querySelector('.user-icon');
                        if (iconDiv) iconDiv.style.transform = `rotate(${angulo}deg)`;
                        // atualiza rota restante visualmente
                        atualizarRotaRestante(pontos, snapInfo.snapIndex);
                    } else {
                        // caso estranho: snapInfo existe mas estamos além do threshold -> esconder trail
                        if (isTrailActive) hideRouteTrail();
                    }
                } else {
                    // sem snapInfo — esconder trail por segurança
                    if (isTrailActive) hideRouteTrail();
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

map.on('click', e => adicionarWaypoint(e.latlng));

function _postProcessarRotaLocal() {
    try {
        if (instrucoesRota && instrucoesRota.length > 0) {
            mostrarSugestao(instrucoesRota[0].instruction || "Siga em frente");
        } else {
            mostrarSugestao("Rota calculada, sem instruções detalhadas.");
        }
    } catch (e) {
        console.warn("Debug: erro em _postProcessarRotaLocal", e);
        mostrarSugestao("Rota calculada.");
    }
}

// ========== Substitua / adicione estas funções ==========

// calcula distância total de uma rota (soma de segmentos)
function rotaDistancia(route) {
    let s = 0;
    for (let i = 0; i < route.length - 1; i++) {
        s += calcularDistancia(route[i], route[i+1]);
    }
    return s;
}

// 2-opt (melhora local) — cuidado: O(n^2) por iteração, bom para <= 30 pontos.
function twoOpt(route) {
    if (!Array.isArray(route) || route.length < 3) return route.slice();
    let best = route.slice();
    let improved = true;
    const maxIter = 500; // evita loop infinito em casos extremos
    let iter = 0;

    while (improved && iter < maxIter) {
        improved = false;
        iter++;
        const n = best.length;
        for (let i = 0; i < n - 2; i++) {
            for (let k = i + 1; k < n - 1; k++) {
                // cria nova rota trocando o segmento (i+1..k)
                const newRoute = best.slice(0, i+1)
                    .concat(best.slice(i+1, k+1).reverse())
                    .concat(best.slice(k+1));
                if (rotaDistancia(newRoute) + 1e-6 < rotaDistancia(best)) {
                    best = newRoute;
                    improved = true;
                }
            }
            if (improved) break;
        }
    }
    return best;
}

/*
  reordenarWaypointsOtimizada(listaWaypoints, startPoint, aplicar2opt = true)

  - listaWaypoints: array de {lat,lng}
  - startPoint: opcional, objeto {lat,lng} (ex: userMarker.getLatLng()) — a otimização parte deste ponto
  - retorna um ARRAY NOVO com os waypoints ordenados (não inclui o startPoint)
*/
function reordenarWaypointsOtimizada(listaWaypoints, startPoint = null, aplicar2opt = true) {
    if (!Array.isArray(listaWaypoints) || listaWaypoints.length <= 1) return listaWaypoints.slice();

    // clone e normaliza
    const restantes = listaWaypoints.map(p => ({ lat: Number(p.lat), lng: Number(p.lng) }));
    const rota = [];
    let atual;

    if (startPoint && startPoint.lat !== undefined && startPoint.lng !== undefined) {
        atual = { lat: Number(startPoint.lat), lng: Number(startPoint.lng) };
    } else {
        // se não foi informado start, começa do primeiro waypoint da lista (comportamento legacy)
        atual = restantes.shift();
        rota.push(atual);
    }

    while (restantes.length > 0) {
        let idxNearest = 0;
        let minD = calcularDistancia(atual, restantes[0]);
        for (let i = 1; i < restantes.length; i++) {
            const d = calcularDistancia(atual, restantes[i]);
            if (d < minD) { minD = d; idxNearest = i; }
        }
        const next = restantes.splice(idxNearest, 1)[0];
        rota.push(next);
        atual = next;
    }

    // rota contém a sequência de waypoints na ordem encontrada.
    // Se foi passado startPoint, rota[0] é o waypoint mais próximo do startPoint.
    if (aplicar2opt && rota.length > 2) {
        return twoOpt(rota);
    }
    return rota;
}


async function buscarERotear() {
    // controla flag para evitar concorrência
    recalculando = true;
    showloadscreen();

    if (!userMarker) {
        hideload();
        recalculando = false;
        mostrarSugestao("Aguardando sua localização...");
        return;
    }
    
    if (waypoints.length === 0) {
        hideload();
        if (rotaLayer) {
            map.removeLayer(rotaLayer);
            rotaLayer = null;
            rotaPolyline = null;
        }
        mostrarSugestao("Adicione waypoints para traçar a rota.");
        return;
    }

    // otimiza os waypoints PARTINDO da posição do usuário
    const waypointsOtimizados = reordenarWaypointsOtimizada(waypoints, userMarker.getLatLng(), true);


    // ✅ Rota começa do usuário e vai pros waypoints otimizados
    const coordenadas = [userMarker.getLatLng(), ...waypointsOtimizados]
        .map(wp => `${wp.lng},${wp.lat}`)
        .join(';');
    
    const url = `https://router.project-osrm.org/route/v1/driving/${coordenadas}?overview=full&alternatives=false&steps=true&geometries=geojson`;

    try {
        const resposta = await fetch(url);
        if (!resposta.ok) throw new Error(`Erro HTTP: ${resposta.status}`);
        const dados = await resposta.json();
        const rota = dados.routes[0];
        if (rota) {
            if (rotaLayer) {
                map.removeLayer(rotaLayer);
                rotaLayer = null;
            }
            if (rotaPolyline) {
                map.removeLayer(rotaPolyline);
                rotaPolyline = null;
            }
            const polyline = rota.geometry.coordinates.map(coord => [coord[1], coord[0]]);
            rotaPolyline = L.polyline(polyline, { color: 'blue', weight: 6 });
            rotaLayer = L.layerGroup().addTo(map);
            rotaLayer.addLayer(rotaPolyline);
            map.fitBounds(rotaPolyline.getBounds());
            instrucoesRota = [];
            rota.legs.forEach(leg => {
                if (leg.steps) {
                    instrucoesRota = instrucoesRota.concat(leg.steps);
                }
            });
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
