// api/giantbomb.js
// Função Serverless da Vercel para interagir com a API Giant Bomb de forma segura.

const GB_API_URL = 'https://www.giantbomb.com/api';

// Lista de géneros e conceitos curados para o projeto
const CURATED_FILTERS = {
    genres: [
        { id: 27, name: 'Survival horror' }, { id: 42, name: "Beat 'em up" },
        { id: 17, name: 'Adventure' }, { id: 10, name: 'Puzzle' },
        { id: 13, name: 'Sports' }, { id: 12, name: 'Strategy' },
        { id: 4, name: 'Racing' }, { id: 11, name: 'Role-Playing' },
        { id: 31, name: 'Simulation' }, { id: 20, name: 'Platform' },
        { id: 9, name: 'Fighting' }
    ],
    concepts: [
        { id: 1401, name: 'Stealth' }, { id: 2501, name: 'Eroge' },
        { id: 869, name: 'Open World' }, { id: 2843, name: 'Roguelike' },
        { id: 3045, name: 'Metroidvania' }
    ]
};

// IDs das plataformas principais que serão exibidas separadamente
const MAIN_PLATFORM_IDS = [
    '22', '19', '35', '146', '179', // PlayStation 1-5
    '32', '20', '145', '180',       // Xbox, 360, One, Series S|X
    '157',                          // Nintendo Switch
    '94'                            // PC
];

// Função auxiliar para fazer chamadas à API
async function giantBombFetch(apiKey, endpoint, params = {}) {
    const query = new URLSearchParams(params);
    query.append('api_key', apiKey);
    query.append('format', 'json');

    const response = await fetch(`${GB_API_URL}${endpoint}?${query.toString()}`, {
        headers: { 'User-Agent': 'GameSorterApp/1.0' },
    });

    if (!response.ok) {
        const errorText = await response.text();
        // Log detalhado da falha na chamada à API externa
        console.error(`Falha na chamada à API Giant Bomb para o endpoint ${endpoint}. Status: ${response.status}. Resposta: ${errorText}`);
        try {
            const errorJson = JSON.parse(errorText);
            throw new Error(errorJson.error || 'Erro desconhecido da API Giant Bomb');
        } catch (e) {
            throw new Error(errorText || 'Erro desconhecido da API Giant Bomb');
        }
    }
    return response.json();
}

// Função para buscar e organizar todos os filtros
async function getCuratedFilters(apiKey) {
    const platformData = await giantBombFetch(apiKey, '/platforms', { field_list: 'id,name,release_date', limit: '200' });

    const mainPlatforms = [];
    const otherPlatforms = [];

    platformData.results.forEach(p => {
        if (MAIN_PLATFORM_IDS.includes(p.id.toString())) {
            mainPlatforms.push(p);
        } else if (p.release_date) {
            otherPlatforms.push(p);
        }
    });
    
    const otherPlatformsByYear = otherPlatforms.reduce((acc, platform) => {
        const year = new Date(platform.release_date).getFullYear();
        if (!acc[year]) { acc[year] = []; }
        acc[year].push(platform);
        return acc;
    }, {});

    return {
        genres: CURATED_FILTERS.genres,
        concepts: CURATED_FILTERS.concepts,
        mainPlatforms,
        otherPlatformsByYear,
    };
}

// Função para buscar o jogo sorteado
async function getSortedGame(apiKey, genres, concepts, platforms) {
    const filters = [];
    if (genres) filters.push(`genres:${genres}`);
    if (concepts) filters.push(`concepts:${concepts}`);
    if (platforms) filters.push(`platforms:${platforms}`);
    
    const searchParams = {
        filter: filters.join(','),
        limit: '100',
        field_list: 'guid,name,original_release_date'
    };
    const searchData = await giantBombFetch(apiKey, '/games', searchParams);

    if (!searchData || searchData.number_of_total_results === 0) {
        return null;
    }

    const gamesWithDate = searchData.results.filter(game => game.original_release_date);
    if (gamesWithDate.length === 0) {
        return null; 
    }

    const randomGameSummary = gamesWithDate[Math.floor(Math.random() * gamesWithDate.length)];
    const gameGuid = randomGameSummary.guid;

    const gameDetails = await giantBombFetch(apiKey, `/game/${gameGuid}/`);
    return gameDetails ? gameDetails.results : null;
}

export default async function handler(request, response) {
    const apiKey = process.env.GIANTBOMB_API_KEY;
    if (!apiKey) {
        console.error("ERRO CRÍTICO: A variável de ambiente GIANTBOMB_API_KEY não foi encontrada.");
        return response.status(500).json({ message: 'A chave da API Giant Bomb não está configurada no servidor.' });
    }

    const { searchParams } = new URL(request.url, `http://${request.headers.host}`);
    const resource = searchParams.get('resource');
    console.log(`A processar pedido para o recurso: ${resource}`);

    try {
        let data;
        switch (resource) {
            case 'filters':
                data = await getCuratedFilters(apiKey);
                break;
            case 'game':
                const genres = searchParams.get('genres') || '';
                const concepts = searchParams.get('concepts') || '';
                const platforms = searchParams.get('platforms') || '';
                data = await getSortedGame(apiKey, genres, concepts, platforms);
                break;
            default:
                console.warn(`Recebido pedido para recurso inválido: ${resource}`);
                return response.status(400).json({ message: 'Recurso inválido.' });
        }

        if (!data) {
            console.log(`Nenhum resultado encontrado para o recurso '${resource}' com os parâmetros fornecidos.`);
            return response.status(404).json({ message: 'Nenhum resultado encontrado.' });
        }
        
        console.log(`Pedido para o recurso '${resource}' bem-sucedido.`);
        response.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
        return response.status(200).json(data);

    } catch (error) {
        console.error(`ERRO no manipulador da API para o recurso '${resource}':`);
        console.error("Mensagem de erro:", error.message);
        console.error("Stack do erro:", error.stack);
        return response.status(500).json({ message: error.message || 'Erro interno do servidor.' });
    }
}

