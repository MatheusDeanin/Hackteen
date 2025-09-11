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
    if (qrcodeElement) {
        qrcodeElement.innerHTML = '';
        const urlDaRota = window.location.href;
        new QRCode(qrcodeElement, urlDaRota);
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
        document.getElementById("qrcode-container").classList.add("esconder");
    }
}

// Roteamento
function buscarERotear() {
    if (!userMarker) {
        return;
    }
    
    if (rotaLayer) {
        map.removeLayer(rotaLayer);
        rotaLayer = null;
        rotaPolyline = null;
    }

    // Limpa a linha do trajeto do usuário
    if (userPath) {
        userPath.setLatLngs([]);
    }

    if (waypoints.length === 0) {
        document.getElementById("qrcode-container").classList.add("esconder");
        hideload(); // <-- adicionado
        return;
    }
    
    // Ordena os waypoints pela distância do usuário
    const userLatLng = userMarker.getLatLng();
    const waypointsOrdenados = [...waypoints].sort((a, b) => {
        const distA = calcularDistancia(userLatLng.lat, userLatLng.lng, a.lat, a.lng);
        const distB = calcularDistancia(userLatLng.lat, userLatLng.lng, b.lat, b.lng);
        return distA - distB;
    });

    const coordsOriginais = [userLatLng, ...waypointsOrdenados];

    const coords = coordsOriginais
        .map(p => [Number(p.lng), Number(p.lat)])
        .filter((value, index, self) =>
            index === self.findIndex(p => p[0] === value[0] && p[1] === value[1])
        );

    if (coords.length < 2) {
        alert("É necessário pelo menos dois pontos únicos para traçar a rota.");
        hideload();
        return;
    }

    console.log("Coordenadas enviadas para ORS:", coords);


    showloadscreen();

    fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
        method: 'POST',
        headers: {
            'Authorization': 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImE0NmE3ZjdkZGFiODQ0NGI4Y2Q3MmE3YjIyNWM3MTlkIiwiaCI6Im11cm11cjY0In0=',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({coordinates: coords})
    })
    .then(res => {
        if (!res.ok) { 
            throw new Error(`Erro de rede: ${res.status}`);
        }
        return res.json();
    })
    .then(routeData => {
        if (routeData.features && routeData.features.length > 0) {
            rotaLayer = L.geoJSON(routeData, {style:{color:'blue', weight:5}}).addTo(map);
            rotaPolyline = rotaLayer.getLayers().find(l => l instanceof L.Polyline) || null;
            if (rotaLayer && rotaLayer.getBounds) map.fitBounds(rotaLayer.getBounds());
            instrucoesRota = routeData.features[0]?.properties?.segments[0]?.steps || [];
            proximaInstrucaoIndex = 0;
            document.getElementById("qrcode-container").classList.remove("esconder");
            gerarQRCode();
        } else {
            alert("Não foi possível encontrar uma rota para os waypoints selecionados. Tente outros pontos.");
        }
        hideload();
        recalculando = false;
    })
    .catch(err => {
        console.error(err);
        alert(`Erro ao traçar a rota: ${err.message}`);
        hideload(); // Garante que a tela de carregamento desapareça em caso de erro
        recalculando = false;
    });
}

// Função para buscar as coordenadas de um endereço
function buscarCoordenadas(endereco) {
    const urlGeocode = `https://api.openrouteservice.org/geocode/search?api_key=eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImE0NmE3ZjdkZGFiODQ0NGI4Y2Q3MmE3YjIyNWM3MTlkIiwiaCI6Im11cm11cjY0In0=&text=${encodeURIComponent(endereco)}`;
    
    return fetch(urlGeocode)
        .then(response => response.json())
        .then(data => {
            if (data.features && data.features.length > 0) {
                const coords = data.features[0].geometry.coordinates;
                return { lat: coords[1], lng: coords[0] };
            }
            throw new Error("Endereço não encontrado.");
        });
}

// Função para adicionar endereço
function adicionarEndereco() {
    const endereco = document.getElementById('endereco').value;
    if (!endereco) {
        alert("Por favor, digite um endereço.");
        return;
    }
    
    showloadscreen();

    buscarCoordenadas(endereco)
        .then(coordenadas => {
            adicionarWaypoint(coordenadas);
        })
        .catch(error => {
            alert(error.message);
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
                        // importante: atualiza o marcador para a posição real ANTES de recalcular
                        userMarker.setLatLng(userLatLng);
                        buscarERotear();
                        setTimeout(() => { recalculando = false; }, 15000);
                    } else {
                        // garante que o marcador não seja "snapado" enquanto recalculando
                        userMarker.setLatLng(userLatLng);
                    }
                } else {
                    // Ainda está dentro da rota -> snap no ponto mais próximo
                    animateMarker(userMarker, pontoSnap, 500); // 500ms de transição
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