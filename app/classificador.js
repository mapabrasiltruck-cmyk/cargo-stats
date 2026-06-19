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
    'a_classificar': '#607D8B'
};

const CATEGORIAS_NOMES = {
    'geral': 'Geral',
    'quimicos': 'Quimicos',
    'construcao': 'Construcao Civil',
    'veiculos': 'Veiculos e Pecas',
    'carga_viva': 'Carga Viva e Derivados',
    'maquinas': 'Maquinas e Tratores',
    'granel': 'Granel',
    'a_classificar': 'Não Classificada'
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
    try {
        const raw = fs.readFileSync(path.join(__dirname, 'cargas', 'mapping_cargas.json'), 'utf8');
        mapping = JSON.parse(raw);
        return mapping;
    } catch (e) {
        console.error('Erro ao carregar mapping_cargas.json:', e.message);
        mapping = { cargas: {} };
        return mapping;
    }
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

function classificarCarga(nomeCarga, cargoId) {
    if (!nomeCarga && !cargoId) return { slug: 'a_classificar', nome: 'Não Classificada', confianca: 'nenhuma' };

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

    if (!nomeCarga) return { slug: 'a_classificar', nome: 'Não Classificada', confianca: 'nenhuma', pontos: 0 };

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

    if (melhorMatch && melhorPontos >= 2) {
        const confianca = melhorPontos >= 10 ? 'alta' : melhorPontos >= 5 ? 'media' : 'baixa';
        return {
            slug: melhorMatch.slug,
            nome: CATEGORIAS_NOMES[melhorMatch.slug] || melhorMatch.nome,
            confianca,
            pontos: melhorPontos
        };
    }

    const fallback = classificarPorSubstring(nomeCarga);
    if (fallback) {
        return { slug: fallback.slug, nome: CATEGORIAS_NOMES[fallback.slug], confianca: 'fallback', pontos: 1 };
    }

    return { slug: 'a_classificar', nome: 'Não Classificada', confianca: 'nenhuma', pontos: 0 };
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
        'quimicos': ['gas', 'oleo', 'diesel', 'fuel', 'petrol', 'quimic', 'acid', 'propano', 'butano'],
        'construcao': ['cimento', 'tijolo', 'telha', 'pedra', 'madeira', 'ferro', 'tubo', 'tinta', 'porta', 'janela'],
        'granel': ['milho', 'trigo', 'soja', 'arroz', 'cafe', 'acucar', 'carvao', 'minerio', 'algodao'],
        'carga_viva': ['gado', 'animal', 'frango', 'boi', 'peixe', 'carne', 'leite', 'ovo'],
        'maquinas': ['trator', 'maquina', 'escavadeira', 'guindaste', 'retro', 'compressor'],
        'veiculos': ['carro', 'caminhao', 'pneu', 'bateria', 'freio', 'motor'],
        'geral': ['caixa', 'pallet', 'container', 'encomenda']
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
