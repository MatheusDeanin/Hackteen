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
    iconUrl: 'Usuario.png',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
});

let userMarker;
let watchId;
let rotaLayer;          // camada GeoJSON inteira
let rotaPolyline = null; // referência para o polyline real (usado no closestLayerPoint)
let destinoGlobal;
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
            // Atualiza posição do usuário
            userMarker.setLatLng([userLat, userLon]);

            // Lógica MAIS ROBUSTA para só desenhar userPath quando estiver realmente sobre a rota
            if (rotaPolyline) {
                try {
                    // converte latlng do GPS para ponto em pixels no layer
                    const layerPoint = map.latLngToLayerPoint(userLatLng);

                    // tenta usar closestLayerPoint (método do PolylineRenderer) para precisão em px
                    const closest = rotaPolyline.closestLayerPoint ? rotaPolyline.closestLayerPoint(layerPoint) : null;

                    let pontoParaAdicionar = null;
                    if (closest && typeof closest.distance === 'number') {
                        // closest.distance está em pixels
                        const pxThreshold = 10; // tolerância em pixels (ajuste se quiser)
                        if (closest.distance <= pxThreshold) {
                            // transforma de volta para latlng o ponto mais próximo na linha
                            const closestLatLng = map.layerPointToLatLng(closest);
                            pontoParaAdicionar = closestLatLng;
                        }
                    }

                    // fallback: usa a busca por vértices (em metros) se closest não estiver disponível
                    if (!pontoParaAdicionar) {
                        const pontos = coletarPontosDaRota();
                        const proximoP = encontrarProximoPontoNaRota(userLatLng, pontos);
                        if (proximoP) {
                            const distanciaAteRota = calcularDistancia(userLat, userLon, proximoP.lat, proximoP.lng);
                            if (distanciaAteRota < 30) { // 30m tolerância
                                pontoParaAdicionar = proximoP;
                            }
                        }
                    }

                    // Só adiciona ao caminho cinza se tiver um ponto válido e não for salto grande
                    if (pontoParaAdicionar) {
                        const ultimoPonto = userPath.getLatLngs().slice(-1)[0];
                        if (!ultimoPonto) {
                            userPath.addLatLng(pontoParaAdicionar);
                        } else {
                            const distUltimo = calcularDistancia(
                                ultimoPonto.lat,
                                ultimoPonto.lng,
                                pontoParaAdicionar.lat,
                                pontoParaAdicionar.lng
                            );
                            // evita saltos grandes (teleporte/erro)
                            if (distUltimo < 100) { // 100m salto máximo permitido
                                userPath.addLatLng(pontoParaAdicionar);
                            }
                        }
                    }
                } catch (e) {
                    // se qualquer erro acontecer na tentativa com closestLayerPoint, faz o fallback simples
                    const pontos = coletarPontosDaRota();
                    const proximoP = encontrarProximoPontoNaRota(userLatLng, pontos);
                    if (proximoP) {
                        const distanciaAteRota = calcularDistancia(userLat, userLon, proximoP.lat, proximoP.lng);
                        if (distanciaAteRota < 30) {
                            const ultimoPonto = userPath.getLatLngs().slice(-1)[0];
                            if (!ultimoPonto || calcularDistancia(ultimoPonto.lat, ultimoPonto.lng, proximoP.lat, proximoP.lng) < 100) {
                                userPath.addLatLng(proximoP);
                            }
                        }
                    }
                }
            } // fim rotaPolyline

            // Lógica de recalculo: se uma rota existe e o usuário está fora dela
            if (rotaLayer && !isUserOnRoute(userLatLng, rotaLayer)) {
                if (!recalculando) { // só entra se não estiver recalculando
                    recalculando = true;
                    alert("Você se desviou da rota. Recalculando...");
                    buscarERotear(destinoGlobal);
                    // opcional: timeout de segurança (caso algo dê errado)
                    setTimeout(() => {
                        // não forçar aqui a liberação se a rota ainda não foi carregada, mas
                        // mantém como "fallback" caso a função fetch trave
                        recalculando = false;
                    }, 15000); // 15s fallback
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

// Função principal para buscar e traçar a rota
function buscarERotear(destino) {
    if (rotaLayer) {
        map.removeLayer(rotaLayer);
        rotaLayer = null;
        rotaPolyline = null;
    }

    // Reinicia o caminho do usuário
    if (userPath) {
        map.removeLayer(userPath);
    }
    userPath = L.polyline([], {color: 'gray', weight: 4}).addTo(map);
    const endereco = destino || document.getElementById("endereco").value;
    if (!endereco) {
        alert("Digite um endereço.");
        recalculando = false;
        return;
    }
    destinoGlobal = endereco;
    if (!userMarker) {
        alert("Aguardando localização do usuário...");
        recalculando = false;
        return;
    }

    const userLatLng = userMarker.getLatLng();

    showloadscreen();

    fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(endereco)}&format=json`, {
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'SeuAppTeste/1.0 (email@exemplo.com)'
        }
    })
    .then(res => res.json())
    .then(data => {
        if (data.length === 0) {
            alert("Endereço não encontrado.");
            hideload();
            recalculando = false;
            return;
        }

        const destLat = parseFloat(data[0].lat);
        const destLon = parseFloat(data[0].lon);

        fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
            method: 'POST',
            headers: {
                'Authorization': 'SUA_KEY_AQUI', // replace com sua key
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                coordinates: [
                    [userLatLng.lng, userLatLng.lat],
                    [destLon, destLat]
                ]
            })
        })
        .then(res => res.json())
        .then(routeData => {
            // remove camada antiga (já removemos antes, mas garantir)
            if (rotaLayer) {
                map.removeLayer(rotaLayer);
                rotaLayer = null;
                rotaPolyline = null;
            }

            // adiciona a nova rota (geojson)
            rotaLayer = L.geoJSON(routeData, {
                style: { color: 'blue', weight: 5 }
            }).addTo(map);

            // extrai o primeiro polyline real para usar closestLayerPoint
            rotaPolyline = null;
            rotaLayer.eachLayer(layer => {
                // pega o primeiro Polyline que encontrar
                if (!rotaPolyline && layer instanceof L.Polyline) {
                    rotaPolyline = layer;
                }
            });

            map.fitBounds(rotaLayer.getBounds());
            
            // Armazena as instruções da rota
            try {
                instrucoesRota = routeData.features[0].properties.segments[0].steps || [];
            } catch (e) {
                instrucoesRota = [];
            }
            proximaInstrucaoIndex = 0; // Reinicia o contador para a nova rota
            
            L.marker([destLat, destLon]).addTo(map).bindPopup("Destino").openPopup();
            hideload();

            // Libera novamente o recálculo: rota já carregada
            recalculando = false;
        })
        .catch(err => {
            console.error("Erro na rota:", err);
            alert("Erro ao traçar a rota.");
            hideload();
            recalculando = false;
        });
    })
    .catch(err => {
        console.error("Erro na busca de endereço:", err);
        alert("Erro ao buscar endereço.");
        hideload();
        recalculando = false;
    });
}
    