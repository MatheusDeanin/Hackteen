// Barra lateral
document.addEventListener("DOMContentLoaded", function () {
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
});

// Loading
function showloadscreen() {
    document.getElementById("tela-carregamento").classList.remove("esconder");
}
function hideload() {
    document.getElementById("tela-carregamento").classList.add("esconder");
}

function calcularAnguloEntreDoisPontos(p1, p2) {
    const dx = p2.lng - p1.lng;
    const dy = p2.lat - p1.lat;
    const rad = Math.atan2(dy, dx);
    const deg = (rad * 180) / Math.PI;
    return deg;
}


let userRotation = 0;

const userDivIcon = L.divIcon({
  className: "user-marker",
  html: `<div class="user-icon" style="transform: rotate(190deg);">
            <img src="./imagens/usuariomarker.png" width="32" height="32"/>
         </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});


// Variáveis
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

const map = L.map('map').setView([-23.5505, -46.6333], 13);
let userPath = L.polyline([], {color: 'gray', weight: 8}).addTo(map);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
}).addTo(map);

// ---------- Funções auxiliares melhoradas ----------

function animateMarker(marker, toLatLng, duration = 1000) {
    const from = marker.getLatLng();
    const start = performance.now();

    function frame(now) {
        const progress = Math.min((now - start) / duration, 1);

        const lat = from.lat + (toLatLng.lat - from.lat) * progress;
        const lng = from.lng + (toLatLng.lng - from.lng) * progress;

        marker.setLatLng([lat, lng]);

        if (progress < 1) {
            requestAnimationFrame(frame);
        }
    }

    requestAnimationFrame(frame);
}


// Flatten latlng arrays returned by GeoJSON / Polyline (handles nested arrays)
function flattenLatLngs(latlngs) {
    const out = [];
    function walk(item) {
        if (!item) return;
        // If it's a LatLng object
        if (item.lat !== undefined && item.lng !== undefined) {
            out.push(item);
            return;
        }
        // If it's an array
        if (Array.isArray(item)) {
            // If array looks like [lng, lat]
            if (item.length >= 2 && typeof item[0] === 'number' && typeof item[1] === 'number') {
                out.push(L.latLng(item[1], item[0]));
                return;
            }
            // Otherwise walk deeper
            item.forEach(sub => walk(sub));
            return;
        }
        // Unknown type, ignore
    }
    walk(latlngs);
    return out;
}

function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const latitude1 = lat1 * Math.PI/180;
    const latitude2 = lat2 * Math.PI/180;
    const diferencaLatitude = (lat2-lat1) * Math.PI/180;
    const diferencaLongitude = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(diferencaLatitude/2)**2 + Math.cos(latitude1)*Math.cos(latitude2)*Math.sin(diferencaLongitude/2)**2;
    const c = 2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Retorna lista plana de pontos (L.LatLng) da rota atual
function coletarPontosDaRota() {
    let pontos = [];
    if (rotaLayer) {
        rotaLayer.eachLayer(layer => {
            if (layer instanceof L.Polyline) {
                const lats = layer.getLatLngs();
                pontos = pontos.concat(flattenLatLngs(lats));
            }
        });
    } else if (rotaPolyline) {
        pontos = flattenLatLngs(rotaPolyline.getLatLngs());
    }
    return pontos;
}

// Encontra o ponto mais próximo da rota e devolve ponto + índice + distância
function encontrarProximoPontoNaRota(userLatLng, rotaPoints) {
    if (!rotaPoints || rotaPoints.length === 0) return { ponto: null, index: -1, distancia: Infinity };
    let ponto = null;
    let menorDist = Infinity;
    let menorIndex = -1;
    rotaPoints.forEach((p, idx) => {
        const d = calcularDistancia(userLatLng.lat, userLatLng.lng, p.lat, p.lng);
        if (d < menorDist) {
            menorDist = d;
            ponto = p;
            menorIndex = idx;
        }
    });
    return { ponto, index: menorIndex, distancia: menorDist };
}

// Atualiza a linha de rota para mostrar apenas os pontos a partir de index
function atualizarRotaRestante(pontos, index) {
    if (!rotaPolyline || !Array.isArray(pontos)) return;
    const restante = pontos.slice(index);
    if (restante.length < 2) {
        // rota concluída
        if (rotaLayer) map.removeLayer(rotaLayer);
        rotaLayer = null;
        rotaPolyline = null;
        return;
    }
    try {
        rotaPolyline.setLatLngs(restante);
        // opcional: atualiza bounds sem forçar zoom brusco
        // map.fitBounds(rotaPolyline.getBounds());
    } catch (e) {
        console.warn('Não foi possível atualizar rota restante:', e);
    }
}

// ---------- Fim funções auxiliares ----------

function removerWaypointPorCoordenada(latlng) {
    const index = waypoints.findIndex(wp => wp.lat === latlng.lat && wp.lng === latlng.lng);
    if (index !== -1) {
        removerWaypoint(index);
    }
}

document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        desfazerWaypoint();
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        refazerWaypoint();
    }
});


// ---------- Função de roteamento (usar OSRM público para teste) ----------
async function buscarERotear() {
  try {
    if (!userMarker) {
      console.warn('buscarERotear: userMarker ainda não definido — a rota será calculada quando houver posição do usuário.');
      return;
    }
    if (!waypoints || waypoints.length === 0) {
      // limpa rota anterior se não houver waypoints
      if (rotaLayer) { map.removeLayer(rotaLayer); rotaLayer = null; }
      if (rotaPolyline) { map.removeLayer(rotaPolyline); rotaPolyline = null; }
      instrucoesRota = [];
      return;
    }

    // Monta lista de pontos: começa pelo usuário (start) e inclui waypoints na ordem atual
    const start = userMarker.getLatLng();
    const coordsArr = [start].concat(waypoints.map(w => L.latLng(w.lat, w.lng)));
    const coordsStr = coordsArr.map(p => `${p.lng},${p.lat}`).join(';');

    const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson&steps=true`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Erro na API de rotas (status ${res.status})`);
    const data = await res.json();
    if (!data.routes || !data.routes.length) throw new Error('Nenhuma rota retornada pelo servidor de roteamento.');

    const route = data.routes[0];

    // Remove rota anterior
    if (rotaLayer) { map.removeLayer(rotaLayer); rotaLayer = null; }
    if (rotaPolyline) { map.removeLayer(rotaPolyline); rotaPolyline = null; }

    // Converte GeoJSON LineString em LatLngs e cria uma polyline (mantém setLatLngs disponível)
    const latlngs = flattenLatLngs(route.geometry.coordinates);
    rotaPolyline = L.polyline(latlngs, { color: '#3388ff', weight: 6 }).addTo(map);
    rotaLayer = rotaPolyline;

    // Ajusta view sem zoom brusco
    try { map.fitBounds(rotaPolyline.getBounds(), { padding: [50, 50] }); } catch (e) { /* ignore */ }

    // Extrai instruções (para mostrar na UI / usar fallback caso rotaPolyline não exista)
    instrucoesRota = [];
    route.legs.forEach(leg => {
      leg.steps.forEach(step => {
        const m = step.maneuver || {};
        // monta uma instrução legível (OSRM nem sempre tem 'instruction' textual)
        const instrText = (step.name ? `${step.name} — ` : '') +
                          (m.instruction || `${m.type || ''} ${m.modifier || ''}`).trim();
        instrucoesRota.push({
          instruction: instrText || 'Siga em frente',
          location: [m.location ? m.location[1] : (step.geometry && step.geometry.coordinates[0][1]) || null,
                     m.location ? m.location[0] : (step.geometry && step.geometry.coordinates[0][0]) || null],
          distance: step.distance,
          duration: step.duration
        });
      });
    });
    proximaInstrucaoIndex = 0;

  } catch (err) {
    console.error('buscarERotear erro:', err);
    // mostra mensagem simples ao usuário
    alert('Erro ao calcular rota: ' + (err.message || err));
  }
}

function desfazerWaypoint() {
    const acao = undoStack.pop();
    if (!acao) return;

    if (acao.tipo === "add") {
        const index = waypoints.findIndex(wp => wp.lat === acao.latlng.lat && wp.lng === acao.latlng.lng);
        if (index !== -1) {
            removerWaypoint(index, false); // false = não registrar no histórico
        }
    } else if (acao.tipo === "remove") {
        waypoints.splice(acao.index, 0, acao.latlng);
        const marker = L.marker(acao.latlng).addTo(map);
        marker.bindPopup(`
            <b>Waypoint</b><br>
            <button class="btn-remover">Remover</button>
        `);
        marker.on("popupopen", () => {
            const btn = document.querySelector(".btn-remover");
            if (btn) {
                btn.onclick = () => {
                    removerWaypointPorCoordenada(acao.latlng);
                };
            }
        });

        waypointMarkers.splice(acao.index, 0, marker);
        atualizarUrlComWaypoints();
        buscarERotear();
    }

    redoStack.push(acao);
}

function refazerWaypoint() {
    const acao = redoStack.pop();
    if (!acao) return;

    if (acao.tipo === "add") {
        adicionarWaypoint(acao.latlng); // já registra no histórico
    } else if (acao.tipo === "remove") {
        const index = waypoints.findIndex(wp => wp.lat === acao.latlng.lat && wp.lng === acao.latlng.lng);
        if (index !== -1) {
            removerWaypoint(index); // já registra no histórico
        }
    }
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
    const coordsString = params.get('waypoints');
    if (coordsString) {
        const coordsArray = coordsString.split(';');
        coordsArray.forEach(coord => {
            const [lat, lng] = coord.split(',').map(Number);
            if (!isNaN(lat) && !isNaN(lng)) {
                waypoints.push({lat, lng});
                const marker = L.marker({lat, lng}).addTo(map);
                marker.bindPopup(`
                    <b>Waypoint</b><br>
                    <button onclick="removerWaypoint(${waypoints.length - 1})">Remover</button>
                `);
                waypointMarkers.push(marker);
            }
        });
    }
}

// Funções de geração e controle do QR Code
function gerarQRCode() {
    const qrcodeElement = document.getElementById("qrcode");
    const content = document.getElementById("qrcode-content");

    if (qrcodeElement) {
        qrcodeElement.innerHTML = '';
        const urlDaRota = window.location.href;
        new QRCode(qrcodeElement, urlDaRota);

        // Garante que o conteúdo apareça
        content.classList.remove("esconder");
    }
}

// Waypoints
function adicionarWaypoint(latlng) {
    if (waypoints.some(wp => wp.lat === latlng.lat && wp.lng === latlng.lng)) {
        return;
    }

    waypoints.push(latlng);

    const marker = L.marker(latlng).addTo(map);
    marker.bindPopup(`
        <b>Waypoint</b><br>
        <button class="btn-remover">Remover</button>
    `);
    marker.on("popupopen", () => {
        const btn = document.querySelector(".btn-remover");
        if (btn) {
            btn.onclick = () => {
                removerWaypointPorCoordenada(latlng);
            };
        }
    });

    waypointMarkers.push(marker);

    // Salvar ação no histórico
    undoStack.push({ tipo: "add", latlng });
    redoStack = []; // limpa o histórico de refazer

    atualizarUrlComWaypoints();

    if (userMarker) {
        buscarERotear();
    }
}

function removerWaypoint(index, registrarHistorico = true) {
    if (waypointMarkers[index]) map.removeLayer(waypointMarkers[index]);
    const removido = waypoints[index];
    waypointMarkers.splice(index, 1);
    waypoints.splice(index, 1);

    if (registrarHistorico) {
        undoStack.push({ tipo: "remove", latlng: removido, index });
        redoStack = [];
    }

    atualizarUrlComWaypoints();

    if (rotaLayer) {
        map.removeLayer(rotaLayer);
        rotaLayer = null;
        rotaPolyline = null;
    }

    if (waypoints.length > 0 && userMarker) {
        buscarERotear();
    } else if (!waypoints.length) {
        document.getElementById("qrcode-content").classList.add("esconder");
    }
}

// Roteamento
async function otimizarRota(waypoints) {
    const body = {
        jobs: waypoints.map((wp, i) => ({ id: i + 1, location: [wp.lng, wp.lat] })),
        vehicles: [{ id: 1, profile: "driving-car", start: [userMarker.getLatLng().lng, userMarker.getLatLng().lat] }]
    };

    const res = await fetch("https://api.openrouteservice.org/v2/optimization", { // <-- sem 0.0.0.0
        method: "POST",
        headers: {
            "Authorization": "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImE0NmE3ZjdkZGFiODQ0NGI4Y2Q3MmE3YjIyNWM3MTlkIiwiaCI6Im11cm11cjY0In0=",
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        throw new Error(`Erro na API: ${res.status}`);
    }

    const data = await res.json();

    // A resposta da ORS Optimization traz a ordem de jobs em data.routes[0].steps
    const ordemOtima = data.routes[0].steps.map(step => {
        const job = body.jobs.find(j => j.id === step.job);
        return { lat: job.location[1], lng: job.location[0] };
    });

    return ordemOtima;
}


// Função para buscar as coordenadas de um endereço
// ======= Geocoding robusto (Nominatim) =======
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

            // Pontua cada candidato
            const scored = data.map(d => {
                return Object.assign({}, d, { score: scoreCandidate(d, inputLower, hasNumber) });
            }).sort((a, b) => b.score - a.score);

            const best = scored[0];

            // se confiança muito baixa, ainda assim retorna, mas loga para debug
            if (best.score < 30) {
                console.warn('Baixa confiança no geocode:', scored.map(s => ({ name: s.display_name, score: s.score })));
            }

            return {
                lat: Number(best.lat),
                lng: Number(best.lon),
                raw: best,
                alternatives: scored.slice(1, 4) // até 3 alternativas
            };
        });
}

async function otimizarRota(waypoints) {
  const body = {
    jobs: waypoints.map((wp, i) => ({
      id: i + 1,
      location: [wp.lng, wp.lat]
    })),
    vehicles: [{
      id: 1,
      profile: "driving-car",
      start: [userMarker.getLatLng().lng, userMarker.getLatLng().lat]
    }]
  };

  const res = await fetch("api.openrouteservice.org/v2/directions", {
    method: "POST",
    headers: {
      "Authorization": "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImE0NmE3ZjdkZGFiODQ0NGI4Y2Q3MmE3YjIyNWM3MTlkIiwiaCI6Im11cm11cjY0In0=",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

    const data = await res.json();
    console.log(data);

    // A resposta traz a ordem ótima dos jobs
    const ordemOtima = data.routes[0].steps.map(step => {
        const job = body.jobs.find(j => j.id === step.job);
        return { lat: job.location[1], lng: job.location[0] };
    });

    return ordemOtima;
}


function scoreCandidate(d, inputLower, hasNumber) {
    const ad = d.address || {};
    let s = 0;

    // número da casa é prioridade alta
    if (hasNumber && (ad.house_number || /\b\d+\b/.test(d.display_name))) s += 60;

    // rua exata
    if (ad.road && inputLower.includes(ad.road.toLowerCase())) s += 30;

    // cidade/bairro
    if (ad.city && inputLower.includes(ad.city.toLowerCase())) s += 25;
    if (ad.town && inputLower.includes(ad.town.toLowerCase())) s += 20;
    if (ad.suburb && inputLower.includes(ad.suburb.toLowerCase())) s += 10;

    // palavras-chave comuns para POIs de saúde
    const poiKeywords = ['upa','hospital','pronto atendimento','pronto-atendimento','posto de saúde','clinica','clínica','posto'];
    if (d.class === 'amenity' && poiKeywords.some(k => inputLower.includes(k))) s += 40;
    if ((d.display_name || '').toLowerCase().split(',').some(p => poiKeywords.some(k => p.includes(k)))) s += 20;

    // preferir nodes (pontos) sobre áreas muito grandes (cidades/regiões)
    if (d.osm_type === 'node') s += 10;

    // bbox muito pequena -> ponto específico
    if (d.boundingbox) {
        const bb = d.boundingbox.map(Number);
        const area = Math.abs((bb[2] - bb[0]) * (bb[3] - bb[1]));
        if (area < 0.001) s += 10;
    }

    // importância fornecida pelo Nominatim
    if (d.importance) s += Math.round(d.importance * 10);

    // match exato do display_name (muito forte)
    if ((d.display_name || '').toLowerCase() === inputLower) s += 50;

    return s;
}


function adicionarEndereco() {
    const endereco = document.getElementById('endereco').value;
    if (!endereco) {
        alert("Por favor, digite um endereço.");
        return;
    }

    showloadscreen();

    buscarCoordenadas(endereco)
        .then(({ lat, lng, raw, alternatives }) => {
            // adiciona o waypoint escolhido (melhor candidato)
            adicionarWaypoint({ lat, lng });

            // marca visualmente as alternativas por alguns segundos (ajuda no debug UX)
            alternatives.forEach(a => {
                try {
                    const circle = L.circleMarker([a.lat, a.lon], { radius: 6, weight: 1, opacity: 0.8 }).addTo(map);
                    circle.bindPopup(`Alternativa: ${a.display_name} (score ${a.score})`);
                    setTimeout(() => {
                        if (map.hasLayer(circle)) map.removeLayer(circle);
                    }, 7000);
                } catch (e) { /* ignore */ }
            });

            // opcional: centralizar um pouco para o destino escolhido
            try { map.panTo([lat, lng]); } catch(e) {}
        })
        .catch(error => {
            alert(error.message || "Erro ao buscar endereço.");
            console.error(error);
        })
        .finally(() => {
            hideload();
        });
}

// Evento que desativa o foco da câmera quando o usuário arrasta o mapa
map.on('movestart', function() {
    followUser = false;
    clearTimeout(followTimeout); 
    followTimeout = setTimeout(function() {
        followUser = true;
        if (userMarker) {
            map.panTo(userMarker.getLatLng());
        }
    }, 15000);
});

// Monitoramento do usuário
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
        } else {
            userMarker.setLatLng(userLatLng);
            if (followUser) {
                map.panTo(userLatLng);
            }
        }

        // Novas regras para monitorar se está fora da rota e atualizar rota percorrida
        if (rotaPolyline) {
            const pontos = coletarPontosDaRota();
            const snapObj = encontrarProximoPontoNaRota(userLatLng, pontos);

            if (snapObj.ponto) {
                const distancia = snapObj.distancia;

                // Se estiver muito longe do ponto mais próximo da rota -> recalcular
                if (distancia > 30) {
                    if (!recalculando && waypoints.length > 0) {
                        recalculando = true;
                        userMarker.setLatLng(userLatLng);
                        buscarERotear();
                        setTimeout(() => { recalculando = false; }, 15000);
                    } else {
                        userMarker.setLatLng(userLatLng);
                    }
                } else {
                    // Ainda está dentro da rota -> snap no ponto mais próximo
                    animateMarker(userMarker, snapObj.ponto, 500); // <-- CORREÇÃO AQUI
                    userPath.addLatLng(snapObj.ponto);

                    // Atualiza a rota para remover a parte já percorrida
                    atualizarRotaRestante(pontos, snapObj.index);

                    // Rotaciona o ícone em direção ao próximo ponto
                    const nextPoint = pontos[snapObj.index + 1] || pontos[snapObj.index];
                    if (nextPoint) {
                        const angulo = calcularAnguloEntreDoisPontos(snapObj.ponto, nextPoint);
                        const el = userMarker.getElement && userMarker.getElement();
                        const iconDiv = el && el.querySelector && el.querySelector('.user-icon');
                        if (iconDiv) iconDiv.style.transform = `rotate(${angulo}deg)`;
                    }
                }
            }

        } else if (instrucoesRota.length > 0 && proximaInstrucaoIndex < instrucoesRota.length) {
            // fallback para rotas com instruções (caso rotaPolyline esteja undefined)
            const instr = instrucoesRota[proximaInstrucaoIndex];

            if (instr && instr.location) {
                const d = calcularDistancia(lat, lon, instr.location[1], instr.location[0]);
                mostrarSugestao(`${instr.instruction} em ${Math.round(d)}m`);
                if (d < 10) proximaInstrucaoIndex++;
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

// Clique no mapa adiciona waypoint
map.on('click', e => adicionarWaypoint(e.latlng));

carregarWaypointsDaUrl();