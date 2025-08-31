// api/giantbomb.js
// Função Serverless da Vercel para interagir com a API Giant Bomb de forma segura.

const GB_API_URL = 'https://www.giantbomb.com/api';

// Função auxiliar para fazer chamadas à API
async function giantBombFetch(apiKey, endpoint, params = {}) {
    const query = new URLSearchParams(params);
    query.append('api_key', apiKey);
    query.append('format', 'json');

    const response = await fetch(`${GB_API_URL}${endpoint}?${query.toString()}`, {
        headers: {
            'User-Agent': 'GameSorterApp/1.0', // A API da Giant Bomb exige um User-Agent
        },
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Giant Bomb API error for endpoint ${endpoint}:`, errorText);
        // Tenta fazer parse do erro, se for JSON
        try {
            const errorJson = JSON.parse(errorText);
            throw new Error(errorJson.error || 'Erro desconhecido da API Giant Bomb');
        } catch (e) {
            throw new Error(errorText || 'Erro desconhecido da API Giant Bomb');
        }
    }
    return response.json();
}


// Função para buscar o jogo sorteado
async function getSortedGame(apiKey, genres, platforms) {
    const filters = [];
    if (genres) filters.push(`genres:${genres}`);
    if (platforms) filters.push(`platforms:${platforms}`);
    
    // 1. Procura jogos com os filtros para obter uma lista
    const searchParams = {
        filter: filters.join(','),
        limit: '100', // Pega uma lista de até 100 jogos
        field_list: 'guid,name' // Apenas o ID e o nome para ser mais rápido
    };
    const searchData = await giantBombFetch(apiKey, '/games', searchParams);

    if (!searchData || searchData.number_of_total_results === 0) {
        return null;
    }

    // 2. Escolhe um jogo aleatório da lista de resultados
    const randomGameSummary = searchData.results[Math.floor(Math.random() * searchData.results.length)];
    const gameGuid = randomGameSummary.guid;

    // 3. Busca os detalhes completos do jogo escolhido
    const gameDetails = await giantBombFetch(apiKey, `/game/${gameGuid}/`);

    return gameDetails ? gameDetails.results : null;
}


export default async function handler(request, response) {
    const apiKey = process.env.GIANTBOMB_API_KEY;
    if (!apiKey) {
        return response.status(500).json({ message: 'A chave da API Giant Bomb não está configurada no servidor.' });
    }

    const { searchParams } = new URL(request.url, `http://${request.headers.host}`);
    const resource = searchParams.get('resource');

    try {
        let data;
        switch (resource) {
            case 'genres':
                // A API pode paginar, mas 100 deve cobrir a maioria dos géneros
                data = await giantBombFetch(apiKey, '/genres', { field_list: 'id,name', limit: '100' });
                break;
            case 'platforms':
                data = await giantBombFetch(apiKey, '/platforms', { field_list: 'id,name', limit: '100' });
                break;
            case 'game':
                const genres = searchParams.get('genres') || '';
                const platforms = searchParams.get('platforms') || '';
                data = await getSortedGame(apiKey, genres, platforms);
                break;
            default:
                return response.status(400).json({ message: 'Recurso inválido.' });
        }

        if (!data) {
            return response.status(404).json({ message: 'Nenhum resultado encontrado.' });
        }
        
        // Cache para evitar sobrecarregar a API
        response.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
        return response.status(200).json(data);

    } catch (error) {
        console.error(`Erro no manipulador da API para o recurso '${resource}':`, error.message);
        return response.status(500).json({ message: error.message || 'Erro interno do servidor.' });
    }
}
