// api/rawg.js
// Função Serverless da Vercel para interagir com a API RAWG via RapidAPI de forma segura.

const RAWG_API_URL = 'https://rawg-video-games-database.p.rapidapi.com';

// Lista de géneros curados com os IDs correspondentes da API RAWG
const CURATED_GENRES = [
    { id: 14, name: 'Simulation' },
    { id: 10, name: 'Strategy' },
    { id: 5, name: 'RPG' }, // Role-playing
    { id: 1, name: 'Racing' },
    { id: 15, name: 'Sports' },
    { id: 7, name: 'Puzzle' },
    { id: 11, name: 'Arcade' }, // Beat 'em up é um subgénero de Arcade/Action
    { id: 3, name: 'Adventure' },
    { id: 83, name: 'Platformer' },
    { id: 6, name: 'Fighting' },
    // Nota: Survival Horror não é um género principal na RAWG, é uma tag.
    // Para simplificar, focamos nos géneros principais.
];

// Função auxiliar para fazer chamadas à API da RapidAPI
async function rawgFetch(apiKey, apiHost, endpoint, params = {}) {
    const query = new URLSearchParams(params);
    const url = `${RAWG_API_URL}${endpoint}?${query.toString()}`;

    const options = {
        method: 'GET',
        headers: {
            'x-rapidapi-key': apiKey,
            'x-rapidapi-host': apiHost
        }
    };

    const response = await fetch(url, options);

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Falha na chamada à API RAWG para o endpoint ${endpoint}. Status: ${response.status}. Resposta: ${errorText}`);
        throw new Error(`Erro ao comunicar com a API de jogos: ${response.statusText}`);
    }
    return response.json();
}

// Função para retornar a lista de géneros curados
async function getFilters() {
    return {
        genres: CURATED_GENRES
    };
}

// Função para buscar um jogo aleatório com base nos filtros
async function getSortedGame(apiKey, apiHost, genres) {
    // 1. Descobre quantos jogos existem com este filtro para encontrar uma página aleatória
    const initialSearch = await rawgFetch(apiKey, apiHost, '/games', { genres, page_size: 1 });
    const totalGames = initialSearch.count;

    if (totalGames === 0) {
        return null;
    }

    // A API permite no máximo 40 resultados por página.
    // E no máximo a página 250 (10000 resultados).
    const maxPage = Math.min(250, Math.ceil(totalGames / 40)); 
    const randomPage = Math.floor(Math.random() * maxPage) + 1;

    // 2. Busca uma página de jogos aleatória
    const gameListData = await rawgFetch(apiKey, apiHost, '/games', {
        genres,
        page: randomPage,
        page_size: 40 // Busca uma página cheia para ter mais opções
    });

    if (!gameListData.results || gameListData.results.length === 0) {
        return null;
    }
    
    // 3. Escolhe um jogo aleatório da página e busca os seus detalhes completos
    const randomGameSummary = gameListData.results[Math.floor(Math.random() * gameListData.results.length)];
    const gameDetails = await rawgFetch(apiKey, apiHost, `/games/${randomGameSummary.id}`);

    return gameDetails;
}

export default async function handler(request, response) {
    const apiKey = process.env.RAPIDAPI_KEY;
    const apiHost = process.env.RAPIDAPI_HOST;

    if (!apiKey || !apiHost) {
        console.error("ERRO CRÍTICO: Variáveis de ambiente RAPIDAPI_KEY ou RAPIDAPI_HOST não encontradas.");
        return response.status(500).json({ message: 'A chave ou host da API não estão configurados no servidor.' });
    }

    const { searchParams } = new URL(request.url, `http://${request.headers.host}`);
    const resource = searchParams.get('resource');
    
    try {
        let data;
        switch (resource) {
            case 'filters':
                data = await getFilters();
                response.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate'); // Cache de 24h para filtros
                break;
            case 'game':
                const genres = searchParams.get('genres') || '';
                data = await getSortedGame(apiKey, apiHost, genres);
                response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); // Sem cache para o jogo
                break;
            default:
                return response.status(400).json({ message: 'Recurso inválido.' });
        }

        if (!data) {
            return response.status(404).json({ message: 'Nenhum resultado encontrado.' });
        }
        
        return response.status(200).json(data);

    } catch (error) {
        console.error(`ERRO no manipulador da API para o recurso '${resource}':`, error.message);
        return response.status(500).json({ message: error.message || 'Erro interno do servidor.' });
    }
}
