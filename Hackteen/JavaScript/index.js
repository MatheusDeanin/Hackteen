// Barra lateral
document.addEventListener("DOMContentLoaded", function () { // Carrega  o DOM
    const botaoMenu = document.getElementById("botaoMenu"); // Botão menu, localizado no canto superior esquerdo
    const sidebar = document.getElementById("sidebar"); // Barra lateral
    const overlay = document.getElementById("overlay"); // Adicionado para poder fechar a barra lateral

    // Abre ou fecha o menu e mostra ou oculta o overlay
    botaoMenu.addEventListener("click", function () {
        sidebar.classList.toggle("aberto"); // Aparece o menu
        overlay.classList.toggle("visivel"); // Aparece o overlay
    });

    // Fecha o menu ao clicar no overlay
    overlay.addEventListener("click", function () { // Detecta o click
        sidebar.classList.remove("aberto"); // Remove quando clicado no overlay
        overlay.classList.remove("visivel"); // Esconde o overlay
    });
});

// Funções de carregamento
function showloadscreen() {
  document.getElementById("tela-carregamento").classList.remove("esconder");
}

function hideload() {
  document.getElementById("tela-carregamento").classList.add("esconder");
}

// Funções para a sugestão de virada
function mostrarSugestao(mensagem) {
    const caixaSugestao = document.getElementById("sugestao-virada");
    const textoSugestao = document.getElementById("texto-sugestao");
    
    textoSugestao.textContent = mensagem;
    caixaSugestao.classList.remove("esconder");
}

function esconderSugestao() {
    const caixaSugestao = document.getElementById("sugestao-virada");
    caixaSugestao.classList.add("esconder");
}


// Ícone
const airplaneIcon = L.icon({
    iconUrl: './imagens/Usuario.png',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
});

let waypoints = [];
let waypointMarkers = [];
let userMarker;
let rotaLayer;
let rotaPolyline = null;
let instrucoesRota = [];
let proximaInstrucaoIndex = 0;
let recalculando = false;

const map = L.map('map').setView([-23.5505, -46.6333], 13);
let userPath = L.polyline([], {color: 'gray', weight: 4}).addTo(map);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
}).addTo(map);

// Função para calcular a distância entre dois pontos (em metros)
function calcularDistancia(lat1, lon1, lat2, lon2) {
    const raioTerra = 6371e3;
    const radLat1 = lat1 * Math.PI / 180;
    const radLat2 = lat2 * Math.PI / 180;
    const diferencaLat = (lat2 - lat1) * Math.PI / 180;
    const diferencaLon = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(diferencaLat / 2) * Math.sin(diferencaLat / 2) +
              Math.cos(radLat1) * Math.cos(radLat2) *
              Math.sin(diferencaLon / 2) * Math.sin(diferencaLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return raioTerra * c;
}

// Verifica se a posição do usuário está próxima da rota (tolerância em metros)
function isUserOnRoute(userLatLng, rotaLayer) {
    if (!rotaLayer) {
        return false;
    }

    let estaNaRota = false;
    const toleranciaMetros = 50;

    rotaLayer.eachLayer(layer => {
        if (layer instanceof L.Polyline) {
            const pontosDaRota = layer.getLatLngs();
            for (let i = 0; i < pontosDaRota.length; i++) {
                const distancia = calcularDistancia(
                    userLatLng.lat,
                    userLatLng.lng,
                    pontosDaRota[i].lat,
                    pontosDaRota[i].lng
                );
                if (distancia < toleranciaMetros) {
                    estaNaRota = true;
                    break;
                }
            }
        }
    });
    return estaNaRota;
}

function adicionarEndereco() {
    const endereco = document.getElementById('endereco').value;
    if (!endereco) {
        alert("Digite um endereço para buscar.");
        return;
    }

    showloadscreen();

    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(endereco)}`)
    .then(res => res.json())
    .then(data => {
        if (data.length === 0) {
            alert("Endereço não encontrado.");
            hideload();
            return;
        }

        const resultado = data[0];
        const lat = parseFloat(resultado.lat);
        const lon = parseFloat(resultado.lon);

        const ponto = L.latLng(lat, lon);

        // Adiciona o waypoint e marcador
        waypoints.push(ponto);
        const marker = L.marker(ponto).addTo(map);
        waypointMarkers.push(marker);

        map.setView(ponto, 13);

        // Limpa o campo para facilitar próximas buscas
        document.getElementById('endereco').value = '';

        // Recalcula rota
        buscarERotear();
    })
    .catch(err => {
        alert("Erro ao buscar o endereço.");
        console.error(err);
        hideload();
    });
}


// Encontra o ponto da rota mais próximo da posição do usuário (fallback por vértices)
function encontrarProximoPontoNaRota(userLatLng, rotaPoints) {
    let proximoPonto = null;
    let menorDistancia = Infinity;

    for (let i = 0; i < rotaPoints.length; i++) {
        const distancia = calcularDistancia(userLatLng.lat, userLatLng.lng, rotaPoints[i].lat, rotaPoints[i].lng);
        if (distancia < menorDistancia) {
            menorDistancia = distancia;
            proximoPonto = rotaPoints[i];
        }
    }
    return proximoPonto;
}

// Calcula o rumo (direção) entre dois pontos em graus
function calcularRumo(lat1, lon1, lat2, lon2) {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
              Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
    let rumo = Math.atan2(y, x) * 180 / Math.PI;

    rumo = (rumo + 360) % 360;
    return rumo;
}

// Helper: pega todos os pontos (LatLng) da rota (concat dos polylines dentro do rotaLayer)
function coletarPontosDaRota() {
    let pontosRota = [];
    if (!rotaLayer) return pontosRota;
    rotaLayer.eachLayer(layer => {
        if (layer instanceof L.Polyline) {
            const latlngs = layer.getLatLngs();
            // se for array de arrays (multi), faz flatten simples:
            if (Array.isArray(latlngs[0])) {
                latlngs.forEach(sub => pontosRota = pontosRota.concat(sub));
            } else {
                pontosRota = pontosRota.concat(latlngs);
            }
        }
    });
    return pontosRota;
}

// Começar a monitorar a posição do usuário assim que carregar a página
if (navigator.geolocation) {
    showloadscreen();

    watchId = navigator.geolocation.watchPosition(pos => {
        const userLat = pos.coords.latitude;
        const userLon = pos.coords.longitude;
        const userLatLng = L.latLng(userLat, userLon);

        if (!userMarker) {
            hideload();
            // Cria o marcador na primeira posição encontrada
            userMarker = L.marker([userLat, userLon], { icon: airplaneIcon }).addTo(map).bindPopup("Você está aqui").openPopup();
            map.setView([userLat, userLon], 13);
        } else {
            // Atualiza a posição do marcador do usuário
            userMarker.setLatLng([userLat, userLon]);
            
            // Lógica para navegação e desenho do caminho do usuário
            if (rotaPolyline) {
                // Tenta encontrar o ponto mais próximo na rota azul com alta precisão
                const layerPoint = map.latLngToLayerPoint(userLatLng);
                const closest = rotaPolyline.closestLayerPoint ? rotaPolyline.closestLayerPoint(layerPoint) : null;
                
                let pontoParaAdicionar = null;

                if (closest && closest.distance <= 15) { // Tolerância de 15 pixels
                    // Se estiver dentro da tolerância, usa o ponto na rota azul
                    pontoParaAdicionar = map.layerPointToLatLng(closest);
                } else {
                    // Fallback: se não estiver perto o suficiente (ou closest não funcionar), usa o método de distância em metros
                    const pontos = coletarPontosDaRota();
                    const proximoP = encontrarProximoPontoNaRota(userLatLng, pontos);
                    
                    if (proximoP && calcularDistancia(userLat, userLon, proximoP.lat, proximoP.lng) < 30) { // Tolerância de 30m
                         pontoParaAdicionar = proximoP;
                    }
                }
                
                // Se um ponto válido na rota azul foi encontrado, adicione-o à linha cinza
                if (pontoParaAdicionar) {
                    const ultimoPonto = userPath.getLatLngs().slice(-1)[0];
                    if (!ultimoPonto || calcularDistancia(ultimoPonto.lat, ultimoPonto.lng, pontoParaAdicionar.lat, pontoParaAdicionar.lng) < 100) {
                        userPath.addLatLng(pontoParaAdicionar);
                    }
                }
            } // Fim da lógica para a linha cinza

            // Lógica de recalculo: se uma rota existe e o usuário está fora dela
            if (rotaLayer && !isUserOnRoute(userLatLng, rotaLayer)) {
                if (!recalculando) { // só entra se não estiver recalculando
                    recalculando = true;
                    alert("Você se desviou da rota. Recalculando...");
                    buscarERotear(destinoGlobal);
                    setTimeout(() => {
                        recalculando = false;
                    }, 15000);
                }
            }

            // Lógica para navegação em tempo real (instruções de virada)
            if (instrucoesRota.length > 0 && proximaInstrucaoIndex < instrucoesRota.length) {
                const instrucaoAtual = instrucoesRota[proximaInstrucaoIndex];
                
                const instrucaoLon = instrucaoAtual.location[0];
                const instrucaoLat = instrucaoAtual.location[1];
                
                const distanciaAteInstrucao = calcularDistancia(
                    userLat,
                    userLon,
                    instrucaoLat,
                    instrucaoLon
                );

                const textoSugestao = instrucaoAtual.instruction;

                // Mostra a instrução se estiver a menos de 200m
                if (distanciaAteInstrucao < 200) {
                    const mensagem = `${textoSugestao} em ${Math.round(distanciaAteInstrucao)}m`;
                    mostrarSugestao(mensagem);
                } else {
                    esconderSugestao();
                }
                
                // Avança para a próxima instrução quando estiver a menos de 10m
                if (distanciaAteInstrucao < 10) { 
                    proximaInstrucaoIndex++;
                    esconderSugestao();
                }
            }
        }

    }, erro => {
        alert("Não foi possível obter sua localização.");
        hideload();
    }, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000
    });

} else {
    alert("Seu navegador não suporta geolocalização.");
    hideload();
}

// Adicionar evento de clique no mapa para criar waypoint
map.on('click', function(e) {
    const latlng = e.latlng;
    waypoints.push(latlng);

    const marker = L.marker(latlng).addTo(map);
    waypointMarkers.push(marker);

    buscarERotear();
});


// Função para traçar rota entre usuário e todos os waypoints adicionados
function buscarERotear() {
    if (!userMarker) {
        alert("Aguardando localização do usuário...");
        return;
    }
    if (waypoints.length === 0) {
        alert("Clique no mapa para adicionar pontos de rota.");
        return;
    }

    if (rotaLayer) {
        map.removeLayer(rotaLayer);
        rotaLayer = null;
        rotaPolyline = null;
    }

    if (userPath) {
        map.removeLayer(userPath);
    }
    userPath = L.polyline([], {color: 'gray', weight: 4}).addTo(map);

    const coords = [userMarker.getLatLng(), ...waypoints];
    const coordinates = coords.map(p => [p.lng, p.lat]);

    showloadscreen();

    fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
        method: 'POST',
        headers: {
            'Authorization': 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImE0NmE3ZjdkZGFiODQ0NGI4Y2Q3MmE3YjIyNWM3MTlkIiwiaCI6Im11cm11cjY0In0=',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({coordinates})
    })
    .then(res => res.json())
    .then(routeData => {
        if (rotaLayer) {
            map.removeLayer(rotaLayer);
            rotaLayer = null;
            rotaPolyline = null;
        }

        rotaLayer = L.geoJSON(routeData, {
            style: { color: 'blue', weight: 5 }
        }).addTo(map);

        rotaPolyline = null;
        rotaLayer.eachLayer(layer => {
            if (!rotaPolyline && layer instanceof L.Polyline) {
                rotaPolyline = layer;
            }
        });

        map.fitBounds(rotaLayer.getBounds());

        try {
            instrucoesRota = routeData.features[0].properties.segments[0].steps || [];
        } catch {
            instrucoesRota = [];
        }
        proximaInstrucaoIndex = 0;

        hideload();
        recalculando = false;
    })
    .catch(err => {
        alert("Erro ao traçar a rota. Último ponto removido.");
        hideload();
        recalculando = false;

        if (waypoints.length > 0) {
            waypoints.pop(); // Remove o último waypoint

            // Remove o último marcador do mapa
            const marker = waypointMarkers.pop();
            if (marker) {
                map.removeLayer(marker);
            }

            buscarERotear(); // Recalcula sem o último ponto
        }

        console.error(err);
    });
}
