// // === helpers ===
// function latLngEquals(a, b, tol = 1e-6) {
//   return Math.abs(Number(a.lat) - Number(b.lat)) < tol && Math.abs(Number(a.lng) - Number(b.lng)) < tol;
// }

// // Retorna array ordenada para ROTEAMENTO apenas (não modifica a variável global `waypoints`)
// function getRoutingOrder(startLatLng, waypointsArr) {
//   if (!startLatLng || !Array.isArray(waypointsArr) || waypointsArr.length === 0) return waypointsArr.slice();
//   return ordenarWaypointsPorProximidade(startLatLng, waypointsArr.slice());
// }

// // === adicionar waypoint (unificado, mantém waypointMarkers e waypoints sincronizados) ===
// function adicionarWaypoint(latlng) {
//     // normaliza
//     const p = { lat: Number(latlng.lat), lng: Number(latlng.lng) };
//     if (waypoints.some(wp => latLngEquals(wp, p))) return;

//     // push em ambas arrays (mesma ordem)
//     waypoints.push(p);
//     const marker = L.marker([p.lat, p.lng], { draggable: true }).addTo(map);
//     waypointMarkers.push(marker);

//     // popup com botão — ao abrir o popup, referenciamos o elemento do popup (evita document.querySelector global)
//     marker.bindPopup(`<b>Waypoint</b><br><button class="btn-remover">Remover</button>`);

//     marker.on("popupopen", function(e) {
//         const popupEl = e.popup && e.popup.getElement && e.popup.getElement();
//         if (!popupEl) return;
//         const btn = popupEl.querySelector(".btn-remover");
//         if (btn) {
//             // remover referenciando o marker atual — assim funcionará mesmo se o marker for arrastado
//             btn.onclick = () => removerWaypointPorMarker(marker);
//         }
//     });

//     // se arrastar, atualiza o array (procura índice pelo próprio marker)
//     marker.on("dragend", function() {
//         const newPos = marker.getLatLng();
//         const idx = waypointMarkers.indexOf(marker);
//         if (idx !== -1) {
//             waypoints[idx] = { lat: newPos.lat, lng: newPos.lng };
//             atualizarUrlComWaypoints();
//             // recalcula rota com a mesma lógica de routing (não altera a ordem dos arrays)
//             buscarERotear();
//         }
//     });

//     atualizarUrlComWaypoints();

//     // Calcula rota (usando ordem otimizada só para roteamento, sem mudar a ordem global)
//     if (userMarker) {
//         buscarERotear();
//     }
// }

// // === remoção por índice (função interna que mantém arrays sincronizados) ===
// function removerWaypoint(index, registrarHistorico = true) {
//     if (index < 0 || index >= waypoints.length) return;

//     const removido = waypoints[index];
//     const marker = waypointMarkers[index];

//     // remove layer e do arrays
//     if (marker && map.hasLayer(marker)) map.removeLayer(marker);
//     waypointMarkers.splice(index, 1);
//     waypoints.splice(index, 1);

//     if (registrarHistorico) {
//         undoStack.push({ tipo: "remove", latlng: removido, index });
//         redoStack = [];
//     }

//     atualizarUrlComWaypoints();

//     // atualiza rota/QR UI
//     if (rotaLayer) {
//         map.removeLayer(rotaLayer);
//         rotaLayer = null;
//         rotaPolyline = null;
//     }

//     if (waypoints.length > 0 && userMarker) {
//         buscarERotear();
//     } else if (!waypoints.length) {
//         const qrc = document.getElementById("qrcode-content");
//         if (qrc) qrc.classList.add("esconder");
//     }
// }

// // === remoção por marker (usada pelos popups) ===
// function removerWaypointPorMarker(marker) {
//     const idx = waypointMarkers.indexOf(marker);
//     if (idx === -1) {
//         // fallback: tentar encontrar por posição
//         const pos = marker.getLatLng();
//         removerWaypointPorCoordenada({ lat: pos.lat, lng: pos.lng });
//         return;
//     }
//     removerWaypoint(idx, true);
// }

// // === remoção por coordenada (compatível com undo/redo e com load via URL) ===
// function removerWaypointPorCoordenada(latlng) {
//     const idx = waypoints.findIndex(wp => latLngEquals(wp, latlng));
//     if (idx !== -1) {
//         removerWaypoint(idx, true);
//     }
// }

// // === carregar waypoints da URL -> usa adicionarWaypoint para manter sincronização ===
// function carregarWaypointsDaUrl() {
//     const params = new URLSearchParams(window.location.search);
//     const coordsString = params.get('waypoints') || params.get('wps'); // suporte aos dois nomes
//     if (!coordsString) return;

//     const coordsArray = coordsString.split(';').map(s => s.trim()).filter(Boolean);
//     coordsArray.forEach(coord => {
//         const parts = coord.split(',').map(Number);
//         if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
//             adicionarWaypoint({ lat: parts[0], lng: parts[1] });
//         }
//     });
// }

// // === salvar URL (mantém ordem de inserção) ===
// function atualizarUrlComWaypoints() {
//     const coordsString = waypoints.map(p => `${p.lat},${p.lng}`).join(';');
//     const novaUrl = new URL(window.location.href);
//     if (coordsString) {
//         novaUrl.searchParams.set('waypoints', coordsString);
//     } else {
//         novaUrl.searchParams.delete('waypoints');
//     }
//     window.history.replaceState({}, '', novaUrl);
//     gerarQRCode();
// }

// // === buscarERotear (USANDO ordem otimizada para roteamento, sem mexer em `waypoints` global) ===
// async function buscarERotear() {
//     try {
//         if (!userMarker) {
//             mostrarSugestao("Aguardando posição do usuário...");
//             return;
//         }

//         if (!waypoints || waypoints.length === 0) {
//             if (rotaLayer) { map.removeLayer(rotaLayer); rotaLayer = null; }
//             if (rotaPolyline) { map.removeLayer(rotaPolyline); rotaPolyline = null; }
//             instrucoesRota = [];
//             mostrarSugestao("Nenhum waypoint definido.");
//             return;
//         }

//         mostrarSugestao("Aguardando rota...");

//         const start = userMarker.getLatLng();

//         // usa uma cópia ordenada apenas para o cálculo da rota
//         const routingWaypoints = getRoutingOrder(start, waypoints);

//         const coordsArr = [start].concat(routingWaypoints.map(w => L.latLng(w.lat, w.lng)));
//         const coordsStr = coordsArr.map(p => `${p.lng},${p.lat}`).join(';');

//         const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson&steps=true`;

//         const res = await fetch(url);
//         if (!res.ok) throw new Error(`Erro na API de rotas (status ${res.status})`);
//         const data = await res.json();
//         if (!data.routes || !data.routes.length) throw new Error('Nenhuma rota retornada pelo servidor de roteamento.');

//         const route = data.routes[0];
//         let latlngs = [];
//         if (route.geometry && route.geometry.coordinates) {
//             latlngs = flattenLatLngs(route.geometry.coordinates);
//         } else {
//             throw new Error('Geometria da rota inesperada.');
//         }

//         if (rotaLayer) { map.removeLayer(rotaLayer); rotaLayer = null; }
//         if (rotaPolyline) { map.removeLayer(rotaPolyline); rotaPolyline = null; }

//         rotaPolyline = L.polyline(latlngs, { color: '#3388ff', weight: 6 });
//         rotaLayer = L.layerGroup().addTo(map);
//         rotaLayer.addLayer(rotaPolyline);

//         try { map.fitBounds(rotaPolyline.getBounds(), { padding: [50, 50] }); } catch (e) { /* ignore */ }

//         // extrai instrucoes (mantém seu código existente)
//         instrucoesRota = [];
//         if (route.legs && Array.isArray(route.legs)) {
//             route.legs.forEach(leg => {
//                 if (leg.steps && Array.isArray(leg.steps)) {
//                     leg.steps.forEach(step => {
//                         const m = step.maneuver || {};
//                         const instrText = (step.name ? `${step.name} — ` : '') +
//                                           (m.instruction || `${m.type || ''} ${m.modifier || ''}`).trim();
//                         instrucoesRota.push({
//                             instruction: instrText || 'Siga em frente',
//                             location: [
//                                 m.location ? m.location[1] : (step.geometry && step.geometry.coordinates && step.geometry.coordinates[0] ? step.geometry.coordinates[0][1] : null),
//                                 m.location ? m.location[0] : (step.geometry && step.geometry.coordinates && step.geometry.coordinates[0] ? step.geometry.coordinates[0][0] : null)
//                             ],
//                             distance: step.distance,
//                             duration: step.duration
//                         });
//                     });
//                 }
//             });
//         }

//         proximaInstrucaoIndex = 0;
//         if (instrucoesRota.length > 0) mostrarSugestao(instrucoesRota[0].instruction);
//         else mostrarSugestao("Rota calculada, sem instruções detalhadas.");

//     } catch (err) {
//         console.error('buscarERotear erro:', err);
//         mostrarSugestao("Erro ao calcular rota.");
//         // não precisamos dar alert automático — mas deixando para debug:
//         // alert('Erro ao calcular rota: ' + (err.message || err));
//     }
// }
