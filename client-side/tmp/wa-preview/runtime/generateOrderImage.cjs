"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateOrderImage = generateOrderImage;
const node_fs_1 = __importDefault(require("node:fs"));
const node_module_1 = require("node:module");
const node_path_1 = __importDefault(require("node:path"));
const puppeteer_core_1 = __importDefault(require("puppeteer-core"));
const requireFromHere = (0, node_module_1.createRequire)(import.meta.url);
const FALLBACK_IMAGE_URL = "https://via.placeholder.com/1024";
const TEMPLATE_WIDTH = 1414;
const TEMPLATE_HEIGHT = 2000;
const MARKED_SELECTION_MIN_PIXELS = 180;
const COMMON_LEFT_TEXT_FIELDS = [
    {
        key: "dateTime",
        x: 260,
        y: 238,
        w: 340,
        h: 80,
        fontSize: 30,
        lineHeight: 1.25,
    },
    { key: "recipientName", x: 260, y: 315, w: 340, fontSize: 32 },
    { key: "recipientPhone", x: 260, y: 392, w: 340, fontSize: 32 },
];
const COMMON_RIGHT_COLUMN_X = 965;
const NOTE_TEXT_X_OFFSET = 115;
const NOTE_TEXT_Y_OFFSET = 48;
const TEMPLATE_LAYOUTS = {
    cake: {
        fileName: "2.jpg",
        slots: [
            { x: 120, y: 530, w: 430, h: 430 },
            { x: 860, y: 530, w: 430, h: 430 },
            { x: 120, y: 1120, w: 350, h: 350 },
            { x: 540, y: 1120, w: 350, h: 350 },
            { x: 960, y: 1120, w: 350, h: 350 },
            { x: 120, y: 1540, w: 350, h: 350 },
            { x: 540, y: 1540, w: 350, h: 350 },
            { x: 960, y: 1540, w: 350, h: 350 },
        ],
        textFields: [
            ...COMMON_LEFT_TEXT_FIELDS,
            {
                key: "rightTop",
                x: COMMON_RIGHT_COLUMN_X,
                y: 238,
                w: 320,
                fontSize: 30,
            },
            {
                key: "rightMiddle",
                x: COMMON_RIGHT_COLUMN_X,
                y: 315,
                w: 320,
                h: 90,
                fontSize: 30,
            },
            {
                key: "rightBottom",
                x: COMMON_RIGHT_COLUMN_X,
                y: 392,
                w: 320,
                fontSize: 30,
            },
        ],
    },
    cookies_tower: {
        fileName: "3.jpg",
        slots: [{ x: 220, y: 600, w: 980, h: 980 }],
        textFields: [
            ...COMMON_LEFT_TEXT_FIELDS,
            {
                key: "rightTop",
                x: COMMON_RIGHT_COLUMN_X,
                y: 296,
                w: 320,
                fontSize: 30,
            },
            {
                key: "rightMiddle",
                x: COMMON_RIGHT_COLUMN_X,
                y: 394,
                w: 320,
                fontSize: 30,
            },
            {
                key: "rightBottom",
                x: COMMON_RIGHT_COLUMN_X,
                y: 476,
                w: 320,
                fontSize: 30,
            },
        ],
    },
    cupcakes: {
        fileName: "4.jpg",
        slots: [
            { x: 500, y: 530, w: 410, h: 430 },
            { x: 120, y: 1120, w: 350, h: 350 },
            { x: 540, y: 1120, w: 350, h: 350 },
            { x: 960, y: 1120, w: 350, h: 350 },
            { x: 120, y: 1540, w: 350, h: 350 },
            { x: 540, y: 1540, w: 350, h: 350 },
            { x: 960, y: 1540, w: 350, h: 350 },
        ],
        textFields: [
            ...COMMON_LEFT_TEXT_FIELDS,
            {
                key: "rightTop",
                x: COMMON_RIGHT_COLUMN_X,
                y: 296,
                w: 320,
                fontSize: 30,
            },
            {
                key: "rightMiddle",
                x: COMMON_RIGHT_COLUMN_X,
                y: 394,
                w: 320,
                h: 120,
                fontSize: 28,
                lineHeight: 1.25,
            },
        ],
    },
    cookies: {
        fileName: "5.jpg",
        slots: [
            { x: 120, y: 575, w: 350, h: 350 },
            { x: 540, y: 575, w: 350, h: 350 },
            { x: 960, y: 575, w: 350, h: 350 },
            { x: 120, y: 1030, w: 350, h: 350 },
            { x: 540, y: 1030, w: 350, h: 350 },
            { x: 960, y: 1030, w: 350, h: 350 },
            { x: 120, y: 1485, w: 350, h: 350 },
            { x: 540, y: 1485, w: 350, h: 350 },
            { x: 960, y: 1485, w: 350, h: 350 },
        ],
        textFields: [
            ...COMMON_LEFT_TEXT_FIELDS,
            {
                key: "rightMiddle",
                x: COMMON_RIGHT_COLUMN_X,
                y: 394,
                w: 320,
                h: 120,
                fontSize: 28,
                lineHeight: 1.25,
            },
        ],
        repeatSlotImages: true,
    },
    box: {
        fileName: "6.jpg",
        slots: [
            { x: 120, y: 575, w: 350, h: 350 },
            { x: 540, y: 575, w: 350, h: 350 },
            { x: 960, y: 575, w: 350, h: 350 },
            { x: 120, y: 1030, w: 350, h: 350 },
            { x: 540, y: 1030, w: 350, h: 350 },
            { x: 960, y: 1030, w: 350, h: 350 },
            { x: 120, y: 1485, w: 350, h: 350 },
            { x: 540, y: 1485, w: 350, h: 350 },
            { x: 960, y: 1485, w: 350, h: 350 },
        ],
        textFields: [
            ...COMMON_LEFT_TEXT_FIELDS,
            {
                key: "rightTop",
                x: COMMON_RIGHT_COLUMN_X,
                y: 296,
                w: 320,
                h: 80,
                fontSize: 28,
                lineHeight: 1.25,
            },
        ],
        repeatSlotImages: true,
    },
    buket_hand: {
        fileName: "7.jpg",
        slots: [
            { x: 70, y: 620, w: 300, h: 320 },
            { x: 415, y: 620, w: 300, h: 320 },
            { x: 760, y: 620, w: 300, h: 320 },
            { x: 1105, y: 620, w: 250, h: 320 },
            { x: 120, y: 1060, w: 350, h: 350 },
            { x: 540, y: 1060, w: 350, h: 350 },
            { x: 960, y: 1060, w: 350, h: 350 },
            { x: 120, y: 1510, w: 350, h: 350 },
            { x: 540, y: 1510, w: 350, h: 350 },
            { x: 960, y: 1510, w: 350, h: 350 },
        ],
        textFields: [
            ...COMMON_LEFT_TEXT_FIELDS,
            {
                key: "rightTop",
                x: COMMON_RIGHT_COLUMN_X,
                y: 296,
                w: 320,
                fontSize: 30,
            },
            {
                key: "rightMiddle",
                x: COMMON_RIGHT_COLUMN_X,
                y: 394,
                w: 320,
                fontSize: 30,
            },
            {
                key: "rightBottom",
                x: COMMON_RIGHT_COLUMN_X,
                y: 476,
                w: 320,
                fontSize: 30,
            },
        ],
    },
    buket_standing: {
        fileName: "8.jpg",
        slots: [
            { x: 70, y: 620, w: 300, h: 320 },
            { x: 415, y: 620, w: 300, h: 320 },
            { x: 760, y: 620, w: 300, h: 320 },
            { x: 1105, y: 620, w: 250, h: 320 },
            { x: 120, y: 1060, w: 350, h: 350 },
            { x: 540, y: 1060, w: 350, h: 350 },
            { x: 960, y: 1060, w: 350, h: 350 },
            { x: 120, y: 1510, w: 350, h: 350 },
            { x: 540, y: 1510, w: 350, h: 350 },
            { x: 960, y: 1510, w: 350, h: 350 },
        ],
        textFields: [
            ...COMMON_LEFT_TEXT_FIELDS,
            {
                key: "rightTop",
                x: COMMON_RIGHT_COLUMN_X,
                y: 296,
                w: 320,
                fontSize: 30,
            },
            {
                key: "rightMiddle",
                x: COMMON_RIGHT_COLUMN_X,
                y: 394,
                w: 320,
                fontSize: 30,
            },
            {
                key: "rightBottom",
                x: COMMON_RIGHT_COLUMN_X,
                y: 476,
                w: 320,
                fontSize: 30,
            },
        ],
    },
};
let cachedTemplateDir;
let cachedTemplateOverrideMap;
const MATCH_STOPWORDS = new Set([
    "a",
    "an",
    "and",
    "angka",
    "body",
    "character",
    "characters",
    "cookie",
    "cookies",
    "dan",
    "dengan",
    "design",
    "desain",
    "di",
    "digimon",
    "for",
    "full",
    "gambar",
    "isi",
    "karakter",
    "nama",
    "no",
    "of",
    "pcs",
    "pc",
    "piece",
    "pieces",
    "slot",
    "tema",
    "the",
    "untuk",
    "with",
]);
function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
function isValidHttpUrl(value) {
    try {
        const parsed = new URL(value);
        return parsed.protocol === "https:" || parsed.protocol === "http:";
    }
    catch {
        return false;
    }
}
function isInlineImageDataUrl(value) {
    return /^data:image\/[a-z0-9.+-]+;base64,/i.test(value.trim());
}
function normalizeLabel(value) {
    return (value || "").trim().replace(/\s+/g, " ");
}
function normalizeReferenceImageUrl(imageUrl) {
    const candidate = (imageUrl || "").trim();
    if (!candidate)
        return null;
    if (isInlineImageDataUrl(candidate))
        return candidate;
    if (!isValidHttpUrl(candidate))
        return null;
    try {
        const parsed = new URL(candidate);
        if (parsed.pathname.includes("/orders/generated/")) {
            return null;
        }
        return parsed.toString();
    }
    catch {
        return null;
    }
}
function normalizeMatchText(value) {
    return (value || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^\p{L}\p{N}\s]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function tokenizeMatchText(value) {
    return normalizeMatchText(value)
        .split(" ")
        .map((token) => token.trim())
        .filter((token) => token.length > 1 && !MATCH_STOPWORDS.has(token) && !/^\d+$/.test(token));
}
function collectReferenceImages(order) {
    const normalizedReferences = [];
    const seen = new Set();
    const structuredReferences = Array.isArray(order.referenceImages)
        ? order.referenceImages
        : [];
    for (const reference of structuredReferences) {
        const normalizedUrl = normalizeReferenceImageUrl(reference?.url);
        if (!normalizedUrl)
            continue;
        const key = `${normalizedUrl}::${normalizeLabel(reference.label)}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        normalizedReferences.push({
            url: normalizedUrl,
            label: normalizeLabel(reference.label) || undefined,
            orderIndex: Number.isFinite(reference.orderIndex) &&
                typeof reference.orderIndex === "number"
                ? reference.orderIndex
                : undefined,
        });
    }
    const fallbackCandidates = [order.imageUrl ?? "", ...(order.imageUrls ?? [])];
    const fallbackReferences = fallbackCandidates
        .map((value) => normalizeReferenceImageUrl(value))
        .filter((value) => Boolean(value));
    for (const url of fallbackReferences) {
        const key = `${url}::`;
        if (seen.has(key))
            continue;
        seen.add(key);
        normalizedReferences.push({ url });
    }
    return normalizedReferences;
}
function extractRequestedImageLabels(order) {
    const explicitLabels = Array.isArray(order.requestedImageLabels)
        ? order.requestedImageLabels
        : [];
    const sourceText = [
        ...explicitLabels,
        order.notes || "",
        order.item || "",
        ...(order.productTags ?? []),
    ]
        .filter(Boolean)
        .join("\n");
    const candidates = sourceText
        .split(/\n|•|,|;/g)
        .map((entry) => normalizeLabel(entry))
        .filter(Boolean);
    const labels = [];
    const seen = new Set();
    for (const candidate of candidates) {
        const matchKey = normalizeMatchText(candidate);
        if (!matchKey)
            continue;
        if (seen.has(matchKey))
            continue;
        seen.add(matchKey);
        labels.push(candidate);
    }
    return labels;
}
function scoreReferenceMatch(reference, requestedLabel) {
    const referenceLabel = normalizeLabel(reference.label);
    if (!referenceLabel)
        return -1;
    const normalizedReference = normalizeMatchText(referenceLabel);
    const normalizedRequested = normalizeMatchText(requestedLabel);
    if (!normalizedReference || !normalizedRequested)
        return -1;
    if (normalizedReference === normalizedRequested)
        return 10000;
    if (normalizedReference.includes(normalizedRequested) ||
        normalizedRequested.includes(normalizedReference)) {
        return 5000;
    }
    const referenceTokens = tokenizeMatchText(referenceLabel);
    const requestedTokens = tokenizeMatchText(requestedLabel);
    if (referenceTokens.length === 0 || requestedTokens.length === 0)
        return -1;
    let score = 0;
    const referenceSet = new Set(referenceTokens);
    const requestedSet = new Set(requestedTokens);
    for (const token of requestedSet) {
        if (referenceSet.has(token)) {
            score += 200;
        }
        else {
            for (const referenceToken of referenceSet) {
                if (referenceToken.includes(token) || token.includes(referenceToken)) {
                    score += 80;
                    break;
                }
            }
        }
    }
    return score > 0 ? score : -1;
}
function orderReferenceImagesForTemplate(referenceImages, requestedLabels) {
    if (referenceImages.length <= 1) {
        return referenceImages;
    }
    const baseOrdered = [...referenceImages].sort((left, right) => {
        const leftIndex = typeof left.orderIndex === "number"
            ? left.orderIndex
            : Number.MAX_SAFE_INTEGER;
        const rightIndex = typeof right.orderIndex === "number"
            ? right.orderIndex
            : Number.MAX_SAFE_INTEGER;
        if (leftIndex !== rightIndex)
            return leftIndex - rightIndex;
        return normalizeLabel(left.label).localeCompare(normalizeLabel(right.label));
    });
    if (requestedLabels.length === 0) {
        return baseOrdered;
    }
    const remaining = [...baseOrdered];
    const matched = [];
    for (const requestedLabel of requestedLabels) {
        let bestIndex = -1;
        let bestScore = -1;
        for (const [index, reference] of remaining.entries()) {
            const score = scoreReferenceMatch(reference, requestedLabel);
            if (score > bestScore) {
                bestScore = score;
                bestIndex = index;
            }
        }
        if (bestIndex >= 0 && bestScore >= 0) {
            const [selected] = remaining.splice(bestIndex, 1);
            if (selected)
                matched.push(selected);
        }
    }
    return [...matched, ...remaining];
}
function normalizeSignalKey(value) {
    return (value || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
}
function normalizeTemplateKey(value) {
    const normalized = normalizeSignalKey(value);
    if (!normalized)
        return null;
    if (normalized === "cake")
        return "cake";
    if (normalized === "cookies_tower" || normalized === "cookie_tower") {
        return "cookies_tower";
    }
    if (normalized === "cupcakes" || normalized === "cupcake") {
        return "cupcakes";
    }
    if (normalized === "cookies" || normalized === "cookie") {
        return "cookies";
    }
    if (normalized === "box" || normalized === "cookies_box") {
        return "box";
    }
    if (normalized === "buket_hand" || normalized === "hand_bouquet") {
        return "buket_hand";
    }
    if (normalized === "buket_standing" || normalized === "standing_bouquet") {
        return "buket_standing";
    }
    return null;
}
function normalizeOrderType(orderType) {
    const normalized = normalizeSignalKey(orderType);
    if (normalized === "cake" ||
        normalized === "cookies_tower" ||
        normalized === "cupcakes" ||
        normalized === "cookies" ||
        normalized === "buket") {
        return normalized;
    }
    return "";
}
function resolveTemplateOverrideMap() {
    if (cachedTemplateOverrideMap !== undefined)
        return cachedTemplateOverrideMap;
    const raw = (process.env.PRODUCTION_TEMPLATE_KEY_OVERRIDES || "").trim();
    if (!raw) {
        cachedTemplateOverrideMap = null;
        return cachedTemplateOverrideMap;
    }
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            cachedTemplateOverrideMap = null;
            return cachedTemplateOverrideMap;
        }
        const map = {};
        for (const [signal, candidate] of Object.entries(parsed)) {
            const normalizedSignal = normalizeSignalKey(signal);
            const templateKey = normalizeTemplateKey(typeof candidate === "string" ? candidate : "");
            if (!normalizedSignal || !templateKey)
                continue;
            map[normalizedSignal] = templateKey;
        }
        cachedTemplateOverrideMap = Object.keys(map).length > 0 ? map : null;
    }
    catch {
        cachedTemplateOverrideMap = null;
    }
    return cachedTemplateOverrideMap;
}
function resolveTemplateOverrideKey(order) {
    const overrides = resolveTemplateOverrideMap();
    if (!overrides)
        return null;
    const candidates = [
        order.templateKey || "",
        order.orderType || "",
        ...(order.productTags ?? []),
        order.item || "",
        order.notes || "",
    ]
        .flatMap((value) => value.split(/[,;\n]/g))
        .map((value) => normalizeSignalKey(value))
        .filter(Boolean);
    for (const candidate of candidates) {
        const match = overrides[candidate];
        if (match)
            return match;
    }
    return null;
}
function prettifyOrderType(orderType) {
    const normalized = (orderType || "").trim().toLowerCase();
    switch (normalized) {
        case "cake":
            return "Cake";
        case "cupcakes":
            return "Cupcake";
        case "cookies":
            return "Cookies";
        case "cookies_tower":
            return "Cookies Tower";
        case "buket":
            return "Bouquet";
        default:
            return "Custom";
    }
}
function inferTemplateKey(order) {
    const overriddenTemplateKey = resolveTemplateOverrideKey(order);
    if (overriddenTemplateKey) {
        return overriddenTemplateKey;
    }
    const explicitTemplateKey = normalizeTemplateKey(order.templateKey);
    if (explicitTemplateKey) {
        return explicitTemplateKey;
    }
    const normalizedOrderType = normalizeOrderType(order.orderType);
    const text = `${(order.productTags ?? []).join(" ")} ${order.item || ""} ${order.notes || ""}`.toLowerCase();
    if (normalizedOrderType === "cake")
        return "cake";
    if (normalizedOrderType === "cupcakes")
        return "cupcakes";
    if (normalizedOrderType === "cookies_tower")
        return "cookies_tower";
    if (normalizedOrderType === "cookies") {
        if (/\bbox\b/.test(text))
            return "box";
        return "cookies";
    }
    if (normalizedOrderType === "buket") {
        if (/standing/.test(text))
            return "buket_standing";
        return "buket_hand";
    }
    if (/cookies?\s*tower|tower/.test(text))
        return "cookies_tower";
    if (/cupcakes?|cupcake/.test(text))
        return "cupcakes";
    if (/standing\s*bouquet|standing/.test(text))
        return "buket_standing";
    if (/buket|bouquet|hand\s*bouquet|flower/.test(text))
        return "buket_hand";
    if (/\bbox\b/.test(text))
        return "box";
    if (/cookies?|cookie/.test(text))
        return "cookies";
    return "cake";
}
function resolveTemplateDirectory() {
    if (cachedTemplateDir !== undefined)
        return cachedTemplateDir;
    const envPath = (process.env.PRODUCTION_TEMPLATE_DIR || "").trim();
    const candidates = [
        envPath ? node_path_1.default.resolve(process.cwd(), envPath) : "",
        node_path_1.default.resolve(process.cwd(), "public", "production-templates"),
        node_path_1.default.resolve(process.cwd(), "Template for Production Team"),
        node_path_1.default.resolve(process.cwd(), "..", "Template for Production Team"),
    ].filter(Boolean);
    for (const candidate of candidates) {
        if (node_fs_1.default.existsSync(candidate) && node_fs_1.default.statSync(candidate).isDirectory()) {
            cachedTemplateDir = candidate;
            return cachedTemplateDir;
        }
    }
    cachedTemplateDir = null;
    return cachedTemplateDir;
}
async function readTemplateDataUrl(fileName) {
    const templateDir = resolveTemplateDirectory();
    if (!templateDir)
        return null;
    const filePath = node_path_1.default.join(templateDir, fileName);
    if (!node_fs_1.default.existsSync(filePath))
        return null;
    const extension = node_path_1.default.extname(filePath).toLowerCase();
    const mimeType = extension === ".png" ? "image/png" : "image/jpeg";
    const bytes = await node_fs_1.default.promises.readFile(filePath);
    return `data:${mimeType};base64,${bytes.toString("base64")}`;
}
function inferRemoteMimeType(source) {
    try {
        const parsed = new URL(source);
        const extension = node_path_1.default.extname(parsed.pathname).toLowerCase();
        if (extension === ".png")
            return "image/png";
        if (extension === ".webp")
            return "image/webp";
        if (extension === ".gif")
            return "image/gif";
    }
    catch {
        // Ignore and use the default below.
    }
    return "image/jpeg";
}
async function fetchImageAsDataUrl(source) {
    if (!source)
        return null;
    if (source.startsWith("data:"))
        return source;
    if (!isValidHttpUrl(source))
        return null;
    try {
        const response = await fetch(source, { cache: "no-store" });
        if (!response.ok)
            return null;
        const bytes = Buffer.from(await response.arrayBuffer());
        const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() ||
            inferRemoteMimeType(source);
        return `data:${mimeType};base64,${bytes.toString("base64")}`;
    }
    catch {
        return null;
    }
}
async function extractMarkedSelectionCrops(page, sourceDataUrl) {
    try {
        return await page.evaluate(async (imageSrc, minPixels) => {
            const loadImage = (src) => new Promise((resolve, reject) => {
                const img = new Image();
                img.decoding = "sync";
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error("Failed to load image"));
                img.src = src;
            });
            const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
            const toIndex = (x, y, width) => y * width + x;
            const image = await loadImage(imageSrc);
            const width = image.naturalWidth || image.width;
            const height = image.naturalHeight || image.height;
            if (!width || !height)
                return [];
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext("2d");
            if (!context)
                return [];
            context.drawImage(image, 0, 0, width, height);
            const pixels = context.getImageData(0, 0, width, height).data;
            const visited = new Uint8Array(width * height);
            const components = [];
            const isMarkedRed = (offset) => {
                const r = pixels[offset];
                const g = pixels[offset + 1];
                const b = pixels[offset + 2];
                const a = pixels[offset + 3];
                return a > 0 && r >= 170 && g <= 120 && b <= 120 && r - g >= 55;
            };
            for (let y = 0; y < height; y += 1) {
                for (let x = 0; x < width; x += 1) {
                    const startIndex = toIndex(x, y, width);
                    if (visited[startIndex])
                        continue;
                    const offset = startIndex * 4;
                    if (!isMarkedRed(offset)) {
                        visited[startIndex] = 1;
                        continue;
                    }
                    const queue = [startIndex];
                    visited[startIndex] = 1;
                    let pixelCount = 0;
                    let minX = x;
                    let minY = y;
                    let maxX = x;
                    let maxY = y;
                    while (queue.length > 0) {
                        const current = queue.pop();
                        if (current == null)
                            continue;
                        const currentX = current % width;
                        const currentY = Math.floor(current / width);
                        pixelCount += 1;
                        minX = Math.min(minX, currentX);
                        minY = Math.min(minY, currentY);
                        maxX = Math.max(maxX, currentX);
                        maxY = Math.max(maxY, currentY);
                        const neighbors = [
                            [currentX - 1, currentY],
                            [currentX + 1, currentY],
                            [currentX, currentY - 1],
                            [currentX, currentY + 1],
                        ];
                        for (const [nextX, nextY] of neighbors) {
                            if (nextX < 0 ||
                                nextY < 0 ||
                                nextX >= width ||
                                nextY >= height) {
                                continue;
                            }
                            const nextIndex = toIndex(nextX, nextY, width);
                            if (visited[nextIndex])
                                continue;
                            visited[nextIndex] = 1;
                            if (isMarkedRed(nextIndex * 4)) {
                                queue.push(nextIndex);
                            }
                        }
                    }
                    const boxWidth = maxX - minX + 1;
                    const boxHeight = maxY - minY + 1;
                    const maxAllowedWidth = width * 0.8;
                    const maxAllowedHeight = height * 0.8;
                    if (pixelCount < minPixels ||
                        boxWidth < 40 ||
                        boxHeight < 40 ||
                        boxWidth > maxAllowedWidth ||
                        boxHeight > maxAllowedHeight) {
                        continue;
                    }
                    components.push({ minX, minY, maxX, maxY, pixelCount });
                }
            }
            const sortedComponents = components.sort((left, right) => {
                const rowDelta = left.minY - right.minY;
                if (Math.abs(rowDelta) > 40)
                    return rowDelta;
                return left.minX - right.minX;
            });
            const crops = [];
            const sampleColor = (x, y) => {
                const boundedX = clamp(x, 0, width - 1);
                const boundedY = clamp(y, 0, height - 1);
                const offset = (boundedY * width + boundedX) * 4;
                return {
                    r: pixels[offset],
                    g: pixels[offset + 1],
                    b: pixels[offset + 2],
                };
            };
            for (const component of sortedComponents) {
                const boxWidth = component.maxX - component.minX + 1;
                const boxHeight = component.maxY - component.minY + 1;
                const inset = Math.max(10, Math.round(Math.min(boxWidth, boxHeight) * 0.08));
                const searchMinX = clamp(component.minX + inset, 0, width - 1);
                const searchMinY = clamp(component.minY + inset, 0, height - 1);
                const searchMaxX = clamp(component.maxX - inset, searchMinX, width - 1);
                const searchMaxY = clamp(component.maxY - inset, searchMinY, height - 1);
                const samples = [
                    sampleColor(searchMinX, searchMinY),
                    sampleColor(searchMaxX, searchMinY),
                    sampleColor(searchMinX, searchMaxY),
                    sampleColor(searchMaxX, searchMaxY),
                ];
                const background = samples.reduce((accumulator, sample) => ({
                    r: accumulator.r + sample.r / samples.length,
                    g: accumulator.g + sample.g / samples.length,
                    b: accumulator.b + sample.b / samples.length,
                }), { r: 0, g: 0, b: 0 });
                let objectMinX = searchMaxX;
                let objectMinY = searchMaxY;
                let objectMaxX = searchMinX;
                let objectMaxY = searchMinY;
                let foregroundPixelCount = 0;
                for (let y = searchMinY; y <= searchMaxY; y += 1) {
                    for (let x = searchMinX; x <= searchMaxX; x += 1) {
                        const offset = (y * width + x) * 4;
                        if (isMarkedRed(offset))
                            continue;
                        const r = pixels[offset];
                        const g = pixels[offset + 1];
                        const b = pixels[offset + 2];
                        const brightness = (r + g + b) / 3;
                        const maxChannel = Math.max(r, g, b);
                        const minChannel = Math.min(r, g, b);
                        const saturation = maxChannel === 0 ? 0 : (maxChannel - minChannel) / maxChannel;
                        const distanceFromBackground = Math.sqrt((r - background.r) ** 2 +
                            (g - background.g) ** 2 +
                            (b - background.b) ** 2);
                        const isForeground = distanceFromBackground >= 26 ||
                            saturation >= 0.12 ||
                            brightness <= 232;
                        if (!isForeground)
                            continue;
                        foregroundPixelCount += 1;
                        objectMinX = Math.min(objectMinX, x);
                        objectMinY = Math.min(objectMinY, y);
                        objectMaxX = Math.max(objectMaxX, x);
                        objectMaxY = Math.max(objectMaxY, y);
                    }
                }
                let cropMinX = searchMinX;
                let cropMinY = searchMinY;
                let cropMaxX = searchMaxX;
                let cropMaxY = searchMaxY;
                if (foregroundPixelCount > 0) {
                    const objectWidth = objectMaxX - objectMinX + 1;
                    const objectHeight = objectMaxY - objectMinY + 1;
                    const objectArea = objectWidth * objectHeight;
                    const searchArea = (searchMaxX - searchMinX + 1) * (searchMaxY - searchMinY + 1);
                    if (objectWidth >= 24 &&
                        objectHeight >= 24 &&
                        objectArea >= searchArea * 0.08) {
                        const padding = Math.max(8, Math.round(Math.min(objectWidth, objectHeight) * 0.08));
                        cropMinX = clamp(objectMinX - padding, 0, width - 1);
                        cropMinY = clamp(objectMinY - padding, 0, height - 1);
                        cropMaxX = clamp(objectMaxX + padding, cropMinX, width - 1);
                        cropMaxY = clamp(objectMaxY + padding, cropMinY, height - 1);
                    }
                }
                const cropWidth = cropMaxX - cropMinX + 1;
                const cropHeight = cropMaxY - cropMinY + 1;
                if (cropWidth < 24 || cropHeight < 24)
                    continue;
                const outputCanvas = document.createElement("canvas");
                outputCanvas.width = cropWidth;
                outputCanvas.height = cropHeight;
                const outputContext = outputCanvas.getContext("2d");
                if (!outputContext)
                    continue;
                outputContext.drawImage(canvas, cropMinX, cropMinY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
                const outputImageData = outputContext.getImageData(0, 0, cropWidth, cropHeight);
                const outputPixels = outputImageData.data;
                const isOutputMarkedRed = (outputOffset) => {
                    const r = outputPixels[outputOffset];
                    const g = outputPixels[outputOffset + 1];
                    const b = outputPixels[outputOffset + 2];
                    const a = outputPixels[outputOffset + 3];
                    return a > 0 && r >= 170 && g <= 120 && b <= 120 && r - g >= 55;
                };
                for (let offset = 0; offset < outputPixels.length; offset += 4) {
                    const r = outputPixels[offset];
                    const g = outputPixels[offset + 1];
                    const b = outputPixels[offset + 2];
                    const brightness = (r + g + b) / 3;
                    const maxChannel = Math.max(r, g, b);
                    const minChannel = Math.min(r, g, b);
                    const saturation = maxChannel === 0 ? 0 : (maxChannel - minChannel) / maxChannel;
                    const distanceFromBackground = Math.sqrt((r - background.r) ** 2 +
                        (g - background.g) ** 2 +
                        (b - background.b) ** 2);
                    if (isOutputMarkedRed(offset) ||
                        (distanceFromBackground <= 18 &&
                            brightness >= 225 &&
                            saturation <= 0.08)) {
                        outputPixels[offset + 3] = 0;
                    }
                }
                outputContext.putImageData(outputImageData, 0, 0);
                crops.push(outputCanvas.toDataURL("image/png"));
            }
            return crops;
        }, sourceDataUrl, MARKED_SELECTION_MIN_PIXELS);
    }
    catch {
        return [];
    }
}
async function resolveRenderableReferenceImages(page, referenceImages) {
    if (referenceImages.length !== 1) {
        return referenceImages.map((reference) => ({
            url: reference.url,
            label: reference.label,
        }));
    }
    const [singleReference] = referenceImages;
    if (!singleReference)
        return [];
    const sourceDataUrl = await fetchImageAsDataUrl(singleReference.url);
    if (!sourceDataUrl) {
        return [{ url: singleReference.url, label: singleReference.label }];
    }
    const extractedCrops = await extractMarkedSelectionCrops(page, sourceDataUrl);
    if (extractedCrops.length > 0) {
        return extractedCrops.map((cropUrl) => ({ url: cropUrl }));
    }
    return [{ url: sourceDataUrl, label: singleReference.label }];
}
function formatTemplateDate(value) {
    const trimmed = (value || "").trim();
    if (!trimmed)
        return "";
    const yyyyMmDdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (yyyyMmDdMatch) {
        const [, year, month, day] = yyyyMmDdMatch;
        return `${day}/${month}/${year}`;
    }
    return trimmed;
}
function formatTemplateTime(value) {
    return (value || "").trim().replace(/\s*wib$/i, "");
}
function buildDefaultTemplateFields(order) {
    const dateLine = [
        formatTemplateDate(order.deliveryDate),
        formatTemplateTime(order.deliveryTime),
    ]
        .filter(Boolean)
        .join(" | ");
    return {
        dateTime: dateLine,
        recipientName: (order.recipientName || order.customerName || "").trim(),
        recipientPhone: (order.recipientPhone || order.phone || "").trim(),
    };
}
function withRepeatedReferences(references, targetLength) {
    if (references.length === 0 || references.length >= targetLength) {
        return references;
    }
    return Array.from({ length: targetLength }, (_, index) => {
        const source = references[index % references.length];
        return source ?? references[0];
    }).filter((reference) => Boolean(reference));
}
function resolveSlotNotes(order, renderableReferenceImages) {
    const explicitNotes = Array.isArray(order.slotNotes)
        ? order.slotNotes.map((note) => normalizeLabel(note)).filter(Boolean)
        : [];
    const referenceLabels = renderableReferenceImages
        .map((reference) => normalizeLabel(reference.label))
        .filter(Boolean);
    const sourceNotes = explicitNotes.length > 0 ? explicitNotes : referenceLabels;
    if (sourceNotes.length === 0)
        return [];
    return Array.from({ length: renderableReferenceImages.length }, (_, index) => sourceNotes[index % sourceNotes.length]);
}
function buildTemplateHtml(order, layout, templateDataUrl, renderableReferenceImages) {
    const effectiveTemplateFields = {
        ...buildDefaultTemplateFields(order),
        ...(order.templateFields ?? {}),
    };
    const shouldRepeatReferenceImages = Boolean(order.allowRepeatedReferenceImages && layout.repeatSlotImages);
    const imageSources = renderableReferenceImages.length > 0
        ? shouldRepeatReferenceImages
            ? withRepeatedReferences(renderableReferenceImages, layout.slots.length)
            : renderableReferenceImages
        : [{ url: FALLBACK_IMAGE_URL }];
    const slotNotes = resolveSlotNotes(order, imageSources);
    const slotMarkup = layout.slots
        .map((slot, index) => {
        const source = imageSources[index];
        if (!source?.url)
            return "";
        return `<img class="slot-image" src="${escapeHtml(source.url)}" style="left:${slot.x}px;top:${slot.y}px;width:${slot.w}px;height:${slot.h}px;" />`;
    })
        .filter(Boolean)
        .join("\n");
    const textMarkup = (layout.textFields ?? [])
        .map((fieldConfig) => {
        const value = effectiveTemplateFields[fieldConfig.key]?.trim();
        if (!value)
            return "";
        const heightStyle = fieldConfig.h ? `height:${fieldConfig.h}px;` : "";
        const fontSize = fieldConfig.fontSize ?? 32;
        const fontWeight = fieldConfig.fontWeight ?? 700;
        const lineHeight = fieldConfig.lineHeight ?? 1.15;
        return `<div class="template-text" style="left:${fieldConfig.x}px;top:${fieldConfig.y}px;width:${fieldConfig.w}px;${heightStyle}font-size:${fontSize}px;font-weight:${fontWeight};line-height:${lineHeight};">${escapeHtml(value)}</div>`;
    })
        .filter(Boolean)
        .join("\n");
    const notesMarkup = layout.slots
        .map((slot, index) => {
        const source = imageSources[index];
        const note = slotNotes[index];
        if (!source?.url || !note)
            return "";
        return `<div class="slot-note" style="left:${slot.x + NOTE_TEXT_X_OFFSET}px;top:${slot.y + slot.h + NOTE_TEXT_Y_OFFSET}px;width:${Math.max(slot.w - NOTE_TEXT_X_OFFSET, 120)}px;">${escapeHtml(note)}</div>`;
    })
        .filter(Boolean)
        .join("\n");
    return `
    <html>
      <head>
        <style>
          * { box-sizing: border-box; font-family: Arial, sans-serif; }
          body { margin: 0; padding: 0; background: #f3f4f6; }
          .sheet {
            position: relative;
            width: ${TEMPLATE_WIDTH}px;
            height: ${TEMPLATE_HEIGHT}px;
            margin: 0;
            background-image: url('${templateDataUrl}');
            background-size: cover;
            background-position: center;
            overflow: hidden;
          }
          .slot-image {
            position: absolute;
            object-fit: cover;
            border-radius: 6px;
            border: 2px solid rgba(255, 255, 255, 0.72);
          }
          .template-text {
            position: absolute;
            color: #111827;
            white-space: pre-wrap;
            overflow: hidden;
            text-shadow: 0 1px 1px rgba(255, 255, 255, 0.45);
          }
          .slot-note {
            position: absolute;
            color: #111827;
            font-size: 24px;
            font-weight: 700;
            line-height: 1.15;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          ${slotMarkup}
          ${textMarkup}
          ${notesMarkup}
        </div>
      </body>
    </html>
  `;
}
function field(label, value) {
    const safeValue = escapeHtml((value || "-").trim() || "-");
    return `<div class="row"><span class="label">${label}</span><span class="value">${safeValue}</span></div>`;
}
function buildFallbackHtml(order, referenceImageUrls) {
    const heroImage = referenceImageUrls[0] || FALLBACK_IMAGE_URL;
    return `
    <html>
      <head>
        <style>
          * { box-sizing: border-box; font-family: Arial, sans-serif; }
          body { margin: 0; padding: 32px; background: #f4f4f5; }
          .card {
            width: 100%;
            max-width: 760px;
            margin: 0 auto;
            border-radius: 16px;
            background: #ffffff;
            border: 1px solid #e4e4e7;
            overflow: hidden;
          }
          .header {
            padding: 20px 24px;
            background: #111827;
            color: #ffffff;
          }
          .title { margin: 0; font-size: 22px; font-weight: 700; }
          .subtitle { margin: 6px 0 0; font-size: 13px; opacity: 0.85; }
          .content { padding: 20px 24px; }
          .hero {
            margin-bottom: 16px;
            border: 1px solid #e4e4e7;
            border-radius: 12px;
            padding: 8px;
            background: #fafafa;
          }
          .hero img {
            width: 100%;
            max-height: 300px;
            object-fit: contain;
            border-radius: 8px;
            display: block;
            background: #ffffff;
          }
          .row {
            display: grid;
            grid-template-columns: 160px 1fr;
            gap: 12px;
            padding: 10px 0;
            border-bottom: 1px dashed #d4d4d8;
          }
          .row:last-child { border-bottom: none; }
          .label { color: #6b7280; font-size: 13px; font-weight: 600; }
          .value { color: #111827; font-size: 14px; white-space: pre-wrap; }
          .footer {
            padding: 14px 24px;
            background: #f9fafb;
            color: #6b7280;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <h1 class="title">ORDER BARU MASUK - PRODUKSI</h1>
            <p class="subtitle">Generated otomatis dari sistem booking</p>
          </div>
          <div class="content">
            <div class="hero">
              <img src="${escapeHtml(heroImage)}" alt="Order image" />
            </div>
            ${field("Customer", order.customerName)}
            ${field("Phone", order.phone)}
            ${field("Delivery Date", order.deliveryDate)}
            ${field("Delivery Time", order.deliveryTime)}
            ${field("Booking Code", order.bookingCode)}
            ${field("Order Type", prettifyOrderType(order.orderType))}
            ${field("Item", order.item)}
            ${field("Address", order.address)}
            ${field("Notes", order.notes)}
          </div>
          <div class="footer">Crumbella Bakery Notification</div>
        </div>
      </body>
    </html>
  `;
}
async function generateOrderImage(order) {
    const referenceImages = orderReferenceImagesForTemplate(collectReferenceImages(order), extractRequestedImageLabels(order));
    const templateKey = inferTemplateKey(order);
    const layout = TEMPLATE_LAYOUTS[templateKey];
    const templateDataUrl = await readTemplateDataUrl(layout.fileName);
    let browser = null;
    const isProd = process.env.NODE_ENV === "production" ||
        process.env.VERCEL_ENV === "production" ||
        process.env.VERCEL === "1";
    try {
        if (isProd) {
            // Required for Vercel/AWS Lambda Serverless environments
            const chromiumModule = requireFromHere("@sparticuz/chromium");
            const chr = ("default" in chromiumModule
                ? chromiumModule.default || chromiumModule
                : chromiumModule);
            const resolvedHeadless = chr.headless === "new" ? true : chr.headless;
            browser = await puppeteer_core_1.default.launch({
                args: chr.args,
                defaultViewport: chr.defaultViewport,
                executablePath: await chr.executablePath(),
                headless: resolvedHeadless,
            });
        }
        else {
            // Load local Chromium only in dev runtime to keep serverless bundles lean.
            const puppeteerLocal = requireFromHere("puppeteer");
            browser = await puppeteerLocal.launch({
                headless: true,
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
            });
        }
        const page = await browser.newPage();
        const renderableReferenceImages = await resolveRenderableReferenceImages(page, referenceImages);
        const useTemplateLayout = Boolean(templateDataUrl);
        await page.setViewport({
            width: useTemplateLayout ? TEMPLATE_WIDTH : 900,
            height: useTemplateLayout ? TEMPLATE_HEIGHT : 1200,
            deviceScaleFactor: 2,
        });
        const html = useTemplateLayout && templateDataUrl
            ? buildTemplateHtml(order, layout, templateDataUrl, renderableReferenceImages)
            : buildFallbackHtml(order, renderableReferenceImages.map((reference) => reference.url));
        await page.setContent(html, { waitUntil: "networkidle0" });
        await page.evaluate(async () => {
            const images = Array.from(document.images);
            await Promise.all(images.map((img) => {
                if (img.complete) {
                    return Promise.resolve();
                }
                return new Promise((resolve) => {
                    img.onload = () => resolve();
                    img.onerror = () => resolve();
                });
            }));
        });
        const imageBytes = useTemplateLayout
            ? await page.screenshot({ type: "png" })
            : await page.screenshot({ type: "png", fullPage: true });
        return Buffer.isBuffer(imageBytes) ? imageBytes : Buffer.from(imageBytes);
    }
    finally {
        if (browser) {
            await browser.close();
        }
    }
}
