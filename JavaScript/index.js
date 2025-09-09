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


