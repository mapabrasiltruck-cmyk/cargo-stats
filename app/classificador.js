const fs = require('fs');
const path = require('path');

const CATEGORIAS_CORES = {
    'geral': '#4CAF50',
    'quimicos': '#F44336',
    'construcao': '#FF9800',
    'veiculos': '#2196F3',
    'carga_viva': '#E91E63',
    'maquinas': '#9C27B0',
    'granel': '#8BC34A',
    'passageiros': '#00BCD4',
    'a_classificar': '#607D8B'
};

const CATEGORIAS_NOMES = {
    'geral': 'Geral',
    'quimicos': 'Químicos',
    'construcao': 'Construção Civil',
    'veiculos': 'Veículos e Peças',
    'carga_viva': 'Carga Viva e Derivados',
    'maquinas': 'Máquinas e Tratores',
    'granel': 'Granel',
    'passageiros': 'Passageiros',
    'a_classificar': 'Cargas Aleatórias'
};

let regras = null;
let mapping = null;

function carregarRegras() {
    if (regras) return regras;
    try {
        const raw = fs.readFileSync(path.join(__dirname, 'cargas', 'regras_cargas.json'), 'utf8');
        regras = JSON.parse(raw);
        return regras;
    } catch (e) {
        console.error('Erro ao carregar regras_cargas.json:', e.message);
        regras = { categorias: [] };
        return regras;
    }
}

function carregarMapping() {
    if (mapping) return mapping;
    const dataDir = process.pkg ? path.dirname(process.execPath) : __dirname;
    const candidates = [path.join(dataDir, 'cargas', 'mapping_cargas.json'), path.join(__dirname, 'cargas', 'mapping_cargas.json')];
    for (const fp of candidates) {
        try {
            const raw = fs.readFileSync(fp, 'utf8');
            mapping = JSON.parse(raw);
            return mapping;
        } catch (e) {}
    }
    console.error('Erro ao carregar mapping_cargas.json');
    mapping = { cargas: {} };
    return mapping;
}

function normalizar(texto) {
    return (texto || '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .trim();
}

function buscarCargaPorId(cargoId) {
    if (!cargoId) return null;
    const map = carregarMapping();
    const normalizado = cargoId.toLowerCase().trim();
    if (map.cargas[normalizado]) {
        const info = map.cargas[normalizado];
        return {
            slug: info.categoria,
            nome: CATEGORIAS_NOMES[info.categoria] || info.categoria,
            nomeCarga: info.nome,
            fonte: 'mapping'
        };
    }
    return null;
}

const PALAVRAS_PASSAGEIROS = ['onibus', 'bus', 'coach', 'passageiro', 'passenger', 'passag', 'volare', 'marcopolo', 'comil', 'ciferal', 'neobus', 'caio', 'busscar', 'irizar', 'micro', 'turismo', 'fretamento', 'rodoviario', 'urbano', 'lotacao', 'escolar', 'circular', 'executivo'];

function detectarPassageiros(nomeCarga, cargoId) {
    const texto = normalizar((cargoId || '') + ' ' + (nomeCarga || ''));
    return PALAVRAS_PASSAGEIROS.some(p => texto.includes(p));
}

function classificarCarga(nomeCarga, cargoId) {
    if (!nomeCarga && !cargoId) return { slug: 'a_classificar', nome: 'Cargas Aleatóricas', confianca: 'nenhuma' };

    if (detectarPassageiros(nomeCarga, cargoId)) {
        return { slug: 'passageiros', nome: CATEGORIAS_NOMES['passageiros'], confianca: 'alta', pontos: 100 };
    }

    if (cargoId) {
        const mapeada = buscarCargaPorId(cargoId);
        if (mapeada) {
            return { ...mapeada, confianca: 'mapeada', pontos: 100 };
        }
    }

    if (nomeCarga) {
        const mapeadaPeloNome = buscarCargaPorNome(nomeCarga);
        if (mapeadaPeloNome) {
            return { ...mapeadaPeloNome, confianca: 'mapeada', pontos: 100 };
        }
    }

    if (!nomeCarga) return { slug: 'a_classificar', nome: 'Cargas Aleatóricas', confianca: 'nenhuma', pontos: 0 };

    const regrasData = carregarRegras();
    const nomeNorm = normalizar(nomeCarga);
    const palavrasNome = nomeNorm.split(/\s+/);

    let melhorMatch = null;
    let melhorPontos = 0;

    for (const cat of regrasData.categorias) {
        let pontos = 0;
        for (const palavra of cat.palavras_chave) {
            const palavraNorm = normalizar(palavra);
            if (palavrasNome.includes(palavraNorm)) {
                pontos += 10;
            } else if (nomeNorm.includes(palavraNorm) && palavraNorm.length >= 4) {
                pontos += 3;
            } else if (palavraNorm.includes(nomeNorm) && nomeNorm.length >= 4) {
                pontos += 2;
            }
        }
        if (pontos > melhorPontos) {
            melhorPontos = pontos;
            melhorMatch = cat;
        }
    }

    if (melhorMatch && melhorPontos >= 2 && melhorMatch.slug !== 'geral') {
        const confianca = melhorPontos >= 10 ? 'alta' : melhorPontos >= 5 ? 'media' : 'baixa';
        return {
            slug: melhorMatch.slug,
            nome: CATEGORIAS_NOMES[melhorMatch.slug] || melhorMatch.nome,
            confianca,
            pontos: melhorPontos
        };
    }

    const fallback = classificarPorSubstring(nomeCarga);
    if (fallback && fallback.slug !== 'geral') {
        return { slug: fallback.slug, nome: CATEGORIAS_NOMES[fallback.slug], confianca: 'fallback', pontos: 1 };
    }

    return { slug: 'a_classificar', nome: 'Cargas Aleatóricas', confianca: 'nenhuma', pontos: 0 };
}

function buscarCargaPorNome(nomeCarga) {
    if (!nomeCarga) return null;
    const map = carregarMapping();
    const nomeNorm = normalizar(nomeCarga);
    for (const [id, info] of Object.entries(map.cargas)) {
        const nomeInfoNorm = normalizar(info.nome);
        if (nomeInfoNorm === nomeNorm) {
            return {
                slug: info.categoria,
                nome: CATEGORIAS_NOMES[info.categoria] || info.categoria,
                nomeCarga: info.nome,
                fonte: 'mapping'
            };
        }
    }
    return null;
}

function classificarPorSubstring(nomeCarga) {
    const mapa = {
        'passageiros': ['onibus', 'bus', 'coach', 'passageiro', 'micro', 'volare', 'marcopolo', 'turismo', 'fretamento', 'viagem'],
        'quimicos': ['gas', 'oleo', 'diesel', 'fuel', 'petrol', 'quimic', 'acid', 'propano', 'butano', 'cloro', 'nitrato', 'sulfato', 'soda', 'caustic', 'amonia', 'alcool', 'etanol', 'metanol', 'solvente', 'veneno', 'tox', 'explosivo', 'inflamavel', 'peroxido', 'resina', 'adesivo', 'pesticida', 'herbicida', 'fertilizante', 'corrosivo'],
        'construcao': ['cimento', 'tijolo', 'telha', 'pedra', 'madeira', 'ferro', 'tubo', 'tinta', 'porta', 'janela', 'areia', 'concreto', 'viga', 'bloco', 'laje', 'calha', 'manilha', 'marmore', 'granito', 'andaime', 'ceramica', 'asfalto', 'brita', 'cascalho', 'vergalhao', 'caibro', 'painel', 'isolante', 'teto', 'telhado', 'escada', 'fio', 'cabo', 'eletrico', 'circuito', 'transformador'],
        'granel': ['milho', 'trigo', 'soja', 'arroz', 'cafe', 'acucar', 'carvao', 'minerio', 'algodao', 'grao', 'semente', 'farinha', 'feijao', 'batata', 'cebola', 'tomate', 'uva', 'maca', 'laranja', 'banana', 'manga', 'melancia', 'abacaxi', 'mandioca', 'ervilha', 'lentilha', 'cevada', 'aveia', 'centeio', 'sorgo', 'pellet', 'farelo', 'substrato', 'feno', 'palha', 'tora', 'sucata', 'scrap'],
        'carga_viva': ['gado', 'animal', 'frango', 'boi', 'peixe', 'carne', 'leite', 'ovo', 'vaca', 'cavalo', 'porco', 'ovelha', 'cabra', 'galinha', 'pato', 'peru', 'coelho', 'mel', 'couro', 'la', 'osso', 'viscera', 'gordura', 'queijo', 'manteiga', 'iogurte', 'salmao', 'sardinha', 'bacalhau', 'camarao', 'resfriado', 'congelado', 'carne bovina', 'carne suina', 'carne frango'],
        'maquinas': ['trator', 'maquina', 'escavadeira', 'guindaste', 'retro', 'compressor', 'gerador', 'bomba', 'prensa', 'serra', 'furadeira', 'solda', 'caldeira', 'forno', 'reator', 'turbina', 'correia', 'rolamento', 'peneira', 'britador', 'moinho', 'empilhadeira', 'colheitadeira', 'niveladora', 'compactador', 'perfuratriz', 'esteira', 'pulverizador', 'semeadeira', 'plantadeira', 'bulldozer', 'locomotiva', 'piloto', 'pilot', 'handl'],
        'veiculos': ['carro', 'caminhao', 'pneu', 'bateria', 'freio', 'motor', 'veiculo', 'peca', 'automovel', 'roda', 'aro', 'embreagem', 'cambio', 'suspensao', 'amortecedor', 'escapamento', 'radiador', 'farol', 'retrovisor', 'parabrisa', 'capo', 'para-choque', 'barco', 'navio', 'iate', 'aviao', 'helicoptero', 'empilhadeira', 'picape', 'pickup', 'suv', 'van', 'caminhonete']
    };

    const nomeNorm = normalizar(nomeCarga);

    for (const [slug, palavras] of Object.entries(mapa)) {
        for (const p of palavras) {
            if (nomeNorm.includes(p)) {
                return { slug };
            }
        }
    }
    return null;
}

function getCategoriasCores() {
    return CATEGORIAS_CORES;
}

function getCategoriasNomes() {
    return CATEGORIAS_NOMES;
}

function invalidarCacheMapping() {
    mapping = null;
}

module.exports = {
    classificarCarga,
    buscarCargaPorId,
    buscarCargaPorNome,
    getCategoriasCores,
    getCategoriasNomes,
    invalidarCacheMapping
};
