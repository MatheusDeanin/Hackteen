# Projeto: DriveGood
# Hackteen - Projeto Empresa Venturus Campinas-SP
# Etec Rodrigues de Abreu

**Participantes:** [Matheus Jordão](https://github.com/MatheusJordao12/); [Matheus Deanin](https://github.com/MatheusDeanin/); [Julia](); [Lucas](https://github.com/LcsGomes-AMS/).

Projeto feito pelo os alunos do 1ºAMS - ETEC/FATEC, para o Hackteen.
<br>
A DriveGood é uma aplicação web que permite ao usuário inserir um destino final e diversos pontos de parada.  
A plataforma então calcula o **trajeto mais eficiente**, utilizando algoritmos de otimização de rotas. Ideal para motoristas, entregadores e qualquer pessoa que precisa realizar múltiplas tarefas durante o deslocamento.
Apps de navegação comuns traçam rotas entre dois pontos, mas não oferecem uma otimização real quando o usuário precisa passar por **vários lugares antes de chegar ao destino**. Isso gera:

- Perda de tempo
- Gasto excessivo de combustível
- Estresse com o trânsito ou rotas ineficientes

Para utilizar, basta o usuário informar:

1. Seu destino final
2. Os pontos intermediários (paradas)
3. E recebe uma **rota otimizada**, com a ordem ideal das paradas

No **backend** foi usado API OpenRouteService e linguagem HTML, CSS e JavaScript


 Documentação da API – OpenRouteService

Este projeto utiliza a **OpenRouteService API** para fornecer funcionalidades de roteamento, otimização de múltiplas paradas e geocodificação de endereços.

[🔗 Site oficial da API](https://openrouteservice.org/dev/#/api-docs)

---

Autenticação

Para usar a API, você precisa de uma chave (API Key).  
Você pode obter uma gratuitamente em:

 https://openrouteservice.org/dev/#/signup

Todas as requisições precisam incluir esse cabeçalho:

```http
Authorization: your_api_key
Content-Type: application/json
```
---
**Víeo de apresentação**

https://github.com/user-attachments/assets/eaf287c9-1c02-4627-ac8b-af44c9c85783


