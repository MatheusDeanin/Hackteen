// Barra lateral
// Aguarda o DOM carregar
document.addEventListener("DOMContentLoaded", function () {
    const botaoMenu = document.getElementById("botaoMenu");
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("overlay");

    // Abre ou fecha o menu e mostra ou oculta o overlay
    botaoMenu.addEventListener("click", function () {
        sidebar.classList.toggle("aberto");
        overlay.classList.toggle("visivel");
    });

    // Fecha o menu ao clicar no overlay
    overlay.addEventListener("click", function () {
        sidebar.classList.remove("aberto");
        overlay.classList.remove("visivel");
    });
});

// Ícone personalizado aviãozinho
const airplaneIcon = L.icon({
  iconUrl: 'aviao.png',
  iconSize: [32, 32],
  iconAnchor: [16   , 16]
});

let userMarker;
let watchId;
let rotaLayer;

const map = L.map('map').setView([-23.5505, -46.6333], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap'
}).addTo(map);

// Começar a monitorar a posição do usuário assim que carregar a página
if (navigator.geolocation) {
  watchId = navigator.geolocation.watchPosition(pos => {
    const userLat = pos.coords.latitude;
    const userLon = pos.coords.longitude;

    if (userMarker) {
      userMarker.setLatLng([userLat, userLon]);
    } else {
      userMarker = L.marker([userLat, userLon], { icon: airplaneIcon }).addTo(map).bindPopup("Você está aqui").openPopup();
      map.setView([userLat, userLon], 13); // Centraliza no usuário na primeira vez
    }

  }, erro => {
    alert("Não foi possível obter sua localização.");
  }, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 10000
  });
} else {
  alert("Seu navegador não suporta geolocalização.");
}

function buscarERotear() {
  const endereco = document.getElementById("endereco").value;
  if (!endereco) {
    alert("Digite um endereço.");
    return;
  }

  if (!userMarker) {
    alert("Aguardando localização do usuário...");
    return;
  }

  const userLatLng = userMarker.getLatLng();

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

      // Marcador do destino (remover marcadores anteriores? aqui só adiciona)
      L.marker([destLat, destLon]).addTo(map).bindPopup("Destino").openPopup();

    })
    .catch(err => {
      console.error("Erro na rota:", err);
      alert("Erro ao traçar a rota.");
    });

  });
}