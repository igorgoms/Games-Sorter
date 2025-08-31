// api/giantbomb.js
// Função Serverless da Vercel para sortear um jogo completamente aleatório da API Giant Bomb.

const GB_API_URL = 'https://www.giantbomb.com/api';
const MAX_ATTEMPTS = 5; // Número de tentativas para encontrar um jogo válido

// Função auxiliar para fazer chamadas à API
async function giantbombFetch(apiKey, endpoint, params = {}) {
    const query = new URLSearchParams(params);
    query.append('api_key', apiKey);
    query.append('format', 'json');

    const response = await fetch(`${GB_API_URL}${endpoint}?${query.toString()}`, {
        headers: { 'User-Agent': 'RandomGameSorter/1.0' },
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Falha na chamada à API Giant Bomb para ${endpoint}. Status: ${response.status}. Resposta: ${errorText}`);
        throw new Error(`Erro ${response.status}: ${response.statusText}. A API externa negou o acesso.`);
    }
    return response.json();
}

// Função para buscar um jogo completamente aleatório
async function getRandomGame(apiKey) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
            // 1. Descobre quantos jogos existem no total
            const countData = await giantbombFetch(apiKey, '/games', { limit: '1', field_list: 'id' });
            const totalGames = countData.number_of_total_results;

            if (totalGames === 0) {
                throw new Error("A API não retornou nenhum jogo.");
            }

            // 2. Sorteia um "offset" aleatório
            const randomOffset = Math.floor(Math.random() * totalGames);

            // 3. Busca um único jogo nessa posição aleatória
            const gameSummaryData = await giantbombFetch(apiKey, '/games', {
                limit: '1',
                offset: randomOffset,
                field_list: 'guid' // Pede apenas o GUID para a próxima chamada
            });

            if (!gameSummaryData.results || gameSummaryData.results.length === 0) {
                console.warn(`Tentativa ${attempt + 1}: O offset aleatório ${randomOffset} não retornou um jogo. A tentar novamente.`);
                continue; // Tenta novamente se o offset não retornar nada
            }

            const gameGuid = gameSummaryData.results[0].guid;

            // 4. Busca os detalhes completos do jogo sorteado
            const gameDetailsData = await giantbombFetch(apiKey, `/game/${gameGuid}/`);
            const game = gameDetailsData.results;

            // 5. Valida se o jogo tem informações mínimas para ser exibido
            if (game && game.name && game.image && game.image.super_url) {
                console.log(`Jogo válido encontrado na tentativa ${attempt + 1}: ${game.name}`);
                return game; // Retorna o jogo se for válido
            } else {
                 console.warn(`Tentativa ${attempt + 1}: O jogo encontrado (${game.name}) não tinha detalhes suficientes. A tentar novamente.`);
            }

        } catch (error) {
            console.error(`Erro na tentativa ${attempt + 1}:`, error.message);
            // Continua para a próxima tentativa se houver um erro
        }
    }

    // Se todas as tentativas falharem
    throw new Error("Não foi possível encontrar um jogo válido após várias tentativas. A API pode estar instável.");
}


export default async function handler(request, response) {
    const apiKey = process.env.GIANTBOMB_API_KEY;
    if (!apiKey) {
        return response.status(500).json({ message: 'A chave da API não está configurada no servidor.' });
    }

    const { searchParams } = new URL(request.url, `http://${request.headers.host}`);
    const resource = searchParams.get('resource');
    
    try {
        let data;
        if (resource === 'random-game') {
            data = await getRandomGame(apiKey);
        } else {
            return response.status(400).json({ message: 'Recurso inválido.' });
        }

        if (!data) {
            return response.status(404).json({ message: 'Nenhum resultado encontrado.' });
        }
        
        response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return response.status(200).json(data);

    } catch (error) {
        console.error(`ERRO no manipulador da API:`, error.message);
        return response.status(500).json({ message: error.message || 'Erro interno do servidor.' });
    }
}

