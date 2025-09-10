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
let rotaLayer;
let destinoGlobal;
let instrucoesRota = []; // Variável para armazenar as instruções da rota
let proximaInstrucaoIndex = 0; // Índice da próxima instrução

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

// Verifica se a posição do usuário está próxima da rota
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

// Encontra o ponto da rota mais próximo da posição do usuário
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
            // Se o marcador já existe, atualiza a posição e adiciona o ponto à rota
            userMarker.setLatLng([userLat, userLon]);
            userPath.addLatLng([userLat, userLon]); // <--- AQUI: A rota só é desenhada nas atualizações
            
            // Lógica de recalculo: se uma rota existe e o usuário está fora dela
            if (rotaLayer && !isUserOnRoute(userLatLng, rotaLayer)) {
                alert("Você se desviou da rota. Recalculando...");
                buscarERotear(destinoGlobal); 
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
    const endereco = destino || document.getElementById("endereco").value;
    if (!endereco) {
        alert("Digite um endereço.");
        return;
    }
    destinoGlobal = endereco;
    if (!userMarker) {
        alert("Aguardando localização do usuário...");
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
            return;
        }

        const destLat = parseFloat(data[0].lat);
        const destLon = parseFloat(data[0].lon);

        fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
            method: 'POST',
            headers: {
                'Authorization': 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjY4NmNhMDAxOGQ1ZjQwZWU4ZWE1OWZkNjEwMGM2ZmNiIiwiaCI6Im11cm11cjY0In0=',
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
            if (rotaLayer) {
                map.removeLayer(rotaLayer);
            }

            rotaLayer = L.geoJSON(routeData, {
                style: { color: 'blue', weight: 5 }
            }).addTo(map);

            map.fitBounds(rotaLayer.getBounds());
            
            // Armazena as instruções da rota
            instrucoesRota = routeData.features[0].properties.segments[0].steps;
            proximaInstrucaoIndex = 0; // Reinicia o contador para a nova rota
            
            L.marker([destLat, destLon]).addTo(map).bindPopup("Destino").openPopup();
            hideload();
        })
        .catch(err => {
            console.error("Erro na rota:", err);
            alert("Erro ao traçar a rota.");
            hideload();
        });
    })
    .catch(err => {
        console.error("Erro na busca de endereço:", err);
        alert("Erro ao buscar endereço.");
        hideload();
    });
}