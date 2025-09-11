// ======== CONFIGURAÇÕES ========

// Sua chave da API OpenRouteService
const ORS_API_KEY = 'SUA_CHAVE_ORS_AQUI';

// Perfil de rota: pode ser 'foot-walking', 'driving-car', etc.
const ROUTING_PROFILE = 'foot-walking'; 

// Variável para o mapa e marcadores
let map;
let marcadorIdoso;
let marcadorCuidador;

// Simulação: localização do cuidador (você). Em uso real, poderia usar geolocalização do navegador
const localizacaoCuidador = {
  lat: -23.55052,   // exemplo São Paulo
  lng: -46.633308
};

// ======== INICIALIZAÇÃO DO MAPA ========
window.onload = function() {
  map = L.map('map').setView([localizacaoCuidador.lat, localizacaoCuidador.lng], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
     attribution: '&copy; OpenStreetMap contribuidores'
  }).addTo(map);

  // marcador do cuidador
  marcadorCuidador = L.marker([localizacaoCuidador.lat, localizacaoCuidador.lng], {title: 'Cuidador'}).addTo(map);

  // marcador do idoso (inicialmente invisível ou em local simulado)
  marcadorIdoso = L.marker([localizacaoCuidador.lat, localizacaoCuidador.lng], {title: 'Idoso', color: 'red'}).addTo(map);
};

// ======== FUNÇÃO PARA SIMULAR RECEBER LOCALIZAÇÃO DO IDOSO ========
// Em um sistema real, isso viria de um backend / dispositivo

function obterLocalizacaoIdosoSimulado() {
  // Aqui apenas movemos randomicamente perto do cuidador
  const deltaLat = (Math.random() - 0.5) * 0.02;
  const deltaLng = (Math.random() - 0.5) * 0.02;
  return {
    lat: localizacaoCuidador.lat + deltaLat,
    lng: localizacaoCuidador.lng + deltaLng
  };
}

// ======== FUNÇÃO PARA TRAÇAR ROTA COM ORS ========
async function traçarRota(pontoOrigem, pontoDestino) {
  const url = 'https://api.openrouteservice.org/v2/directions/' + ROUTING_PROFILE + '/geojson';

  const body = {
    coordinates: [
      [pontoOrigem.lng, pontoOrigem.lat],
      [pontoDestino.lng, pontoDestino.lat]
    ]
  };

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
        'Content-Type': 'application/json',
        'Authorization': ORS_API_KEY
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      throw new Error(`Erro na rota: ${resp.status}`);
    }

    const json = await resp.json();
    return json;  // contém GeoJSON da rota, que pode ser desenhado no mapa
  } catch (err) {
    console.error(err);
    throw err;
  }
}

// ======== EVENTO DO BOTÃO ========
document.getElementById('localizar-idoso').addEventListener('click', async () => {
  document.getElementById('status').textContent = 'Obtendo localização do idoso...';
  
  // simula recebimento da localização
  const posIdoso = obterLocalizacaoIdosoSimulado();
  
  // atualiza marcador no mapa
  marcadorIdoso.setLatLng([posIdoso.lat, posIdoso.lng]).bindPopup('Idoso está aqui').openPopup();
  
  map.setView([posIdoso.lat, posIdoso.lng], 14);

  document.getElementById('status').textContent = `Idoso localizado em: (${posIdoso.lat.toFixed(5)}, ${posIdoso.lng.toFixed(5)})`;

  // traçar rota entre cuidador e idoso
  try {
    const rotaGeojson = await traçarRota(localizacaoCuidador, posIdoso);

    // remover rota antiga se existir
    if (window.layerRota) {
      map.removeLayer(window.layerRota);
    }

    // adicionar rota nova
    window.layerRota = L.geoJSON(rotaGeojson, {
      style: {
        color: 'blue',
        weight: 4,
        opacity: 0.7
      }
    }).addTo(map);

    document.getElementById('status').textContent += ' → Rota desenhada.';
  } catch (err) {
    document.getElementById('status').textContent = 'Não foi possível traçar rota.';
  }
});