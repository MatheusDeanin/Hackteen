// Inicializando o mapa na latitude e longitude especificada, com zoom 13
const map = L.map('map').setView([-22.3145, -49.0609], 13);

// Adicionando as tiles do OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19,
}).addTo(map);

// Adicionando um marcador na mesma posição
L.marker([-22.3145, -49.0609]).addTo(map)
  .bindPopup('Localização atual')
  .openPopup();
