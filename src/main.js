/**
 * Centris.ca Quebec Real Estate Scraper
 * 
 * Scrapes property listings from Centris.ca with comprehensive filtering options.
 * Uses Playwright for JavaScript rendering and stealth mode to handle anti-bot measures.
 * 
 * @author DC Immobilier
 * @version 1.0.0
 */

import { Actor, log } from 'apify';
import { PlaywrightCrawler, Configuration } from 'crawlee';
import { Page } from 'playwright';

// Centris.ca configuration
const CENTRIS_BASE_URL = 'https://www.centris.ca';
const CENTRIS_SEARCH_URL = `${CENTRIS_BASE_URL}/fr/propriete~a-vendre`;
const CENTRIS_RENT_URL = `${CENTRIS_BASE_URL}/fr/propriete~a-louer`;
const CENTRIS_EN_SEARCH_URL = `${CENTRIS_BASE_URL}/en/properties~for-sale`;
const CENTRIS_EN_RENT_URL = `${CENTRIS_BASE_URL}/en/properties~for-rent`;

// Property type mappings (URL slug format)
const PROPERTY_TYPE_MAP = {
    house: 'maison',
    condo: 'condo',
    plex: 'plex',
    land: 'terrain',
    commercial: 'commercial',
    farm: 'ferme',
    cottage: 'chalet'
};

const PROPERTY_TYPE_MAP_EN = {
    house: 'house',
    condo: 'condo',
    plex: 'plex',
    land: 'land',
    commercial: 'commercial',
    farm: 'farm',
    cottage: 'cottage'
};

// Region mappings to Centris slugs
const REGION_MAP = {
    'montreal': 'montreal',
    'montréal': 'montreal',
    'quebec city': 'quebec',
    'québec': 'quebec',
    'laval': 'laval',
    'longueuil': 'longueuil',
    'gatineau': 'gatineau',
    'sherbrooke': 'sherbrooke',
    'trois-rivières': 'trois-rivieres',
    'trois-rivieres': 'trois-rivieres',
    'saguenay': 'saguenay',
    'lévis': 'levis',
    'levis': 'levis',
    'terrebonne': 'terrebonne',
    'saint-jean-sur-richelieu': 'saint-jean-sur-richelieu',
    'brossard': 'brossard',
    'repentigny': 'repentigny',
    'drummondville': 'drummondville',
    'saint-jérôme': 'saint-jerome',
    'granby': 'granby'
};

// Sort options mapping
const SORT_MAP = {
    'date_desc': 'DateDescending',
    'date_asc': 'DateAscending', 
    'price_asc': 'PriceAscending',
    'price_desc': 'PriceDescending'
};

// Listing age to days mapping
const LISTING_AGE_MAP = {
    '24h': 1,
    '7days': 7,
    '30days': 30,
    '90days': 90,
    'any': null
};

await Actor.init();

// Get input configuration
const input = await Actor.getInput() ?? {};

const {
    searchType = 'buy',
    propertyTypes = [],
    regions = ['Montreal'],
    neighborhoods = [],
    minPrice = 0,
    maxPrice = 0,
    minBedrooms = 0,
    maxBedrooms = 0,
    minBathrooms = 0,
    maxBathrooms = 0,
    minLivingArea = 0,
    maxLivingArea = 0,
    minLotSize = 0,
    maxLotSize = 0,
    yearBuiltMin = 0,
    yearBuiltMax = 0,
    features = [],
    listingAge = 'any',
    sortBy = 'date_desc',
    maxListings = 100,
    includeDetails = true,
    includeImages = true,
    language = 'fr',
    proxyConfiguration,
    maxConcurrency = 3,
    maxRequestRetries = 3
} = input;

// Track statistics
let listingsScraped = 0;
let pagesScraped = 0;
let errors = 0;

log.info('Starting Centris.ca scraper with configuration:', {
    searchType,
    propertyTypes,
    regions,
    maxListings,
    language
});

// Create proxy configuration
const proxyConfig = await Actor.createProxyConfiguration(proxyConfiguration);

/**
 * Build the search URL with filters
 */
function buildSearchUrl(pageNumber = 1) {
    const isFrench = language === 'fr';
    let baseUrl;
    
    if (searchType === 'rent') {
        baseUrl = isFrench ? CENTRIS_RENT_URL : CENTRIS_EN_RENT_URL;
    } else {
        baseUrl = isFrench ? CENTRIS_SEARCH_URL : CENTRIS_EN_SEARCH_URL;
    }
    
    // Build query parameters
    const params = new URLSearchParams();
    
    // Add property types
    if (propertyTypes.length > 0) {
        const typeMap = isFrench ? PROPERTY_TYPE_MAP : PROPERTY_TYPE_MAP_EN;
        const types = propertyTypes.map(t => typeMap[t] || t).join(',');
        params.append('pt', types);
    }
    
    // Add price range
    if (minPrice > 0) params.append('pmin', minPrice.toString());
    if (maxPrice > 0) params.append('pmax', maxPrice.toString());
    
    // Add bedrooms
    if (minBedrooms > 0) params.append('nbmin', minBedrooms.toString());
    if (maxBedrooms > 0) params.append('nbmax', maxBedrooms.toString());
    
    // Add bathrooms
    if (minBathrooms > 0) params.append('sbmin', minBathrooms.toString());
    if (maxBathrooms > 0) params.append('sbmax', maxBathrooms.toString());
    
    // Add living area (convert sq ft to sq m for Centris internal use)
    if (minLivingArea > 0) params.append('samin', Math.round(minLivingArea * 0.0929).toString());
    if (maxLivingArea > 0) params.append('samax', Math.round(maxLivingArea * 0.0929).toString());
    
    // Add lot size
    if (minLotSize > 0) params.append('lsmin', Math.round(minLotSize * 0.0929).toString());
    if (maxLotSize > 0) params.append('lsmax', Math.round(maxLotSize * 0.0929).toString());
    
    // Add year built
    if (yearBuiltMin > 0) params.append('ybmin', yearBuiltMin.toString());
    if (yearBuiltMax > 0) params.append('ybmax', yearBuiltMax.toString());
    
    // Add sort
    params.append('sort', SORT_MAP[sortBy] || 'DateDescending');
    
    // Add page
    if (pageNumber > 1) {
        params.append('page', pageNumber.toString());
    }
    
    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

/**
 * Build region-specific search URL
 */
function buildRegionSearchUrl(region, pageNumber = 1) {
    const isFrench = language === 'fr';
    const regionSlug = REGION_MAP[region.toLowerCase()] || region.toLowerCase().replace(/\s+/g, '-');
    
    let baseUrl;
    if (searchType === 'rent') {
        baseUrl = isFrench 
            ? `${CENTRIS_BASE_URL}/fr/propriete~a-louer~${regionSlug}`
            : `${CENTRIS_BASE_URL}/en/properties~for-rent~${regionSlug}`;
    } else {
        baseUrl = isFrench 
            ? `${CENTRIS_BASE_URL}/fr/propriete~a-vendre~${regionSlug}`
            : `${CENTRIS_BASE_URL}/en/properties~for-sale~${regionSlug}`;
    }
    
    const params = new URLSearchParams();
    
    // Add all the same filters
    if (propertyTypes.length > 0) {
        const typeMap = isFrench ? PROPERTY_TYPE_MAP : PROPERTY_TYPE_MAP_EN;
        const types = propertyTypes.map(t => typeMap[t] || t).join(',');
        params.append('pt', types);
    }
    
    if (minPrice > 0) params.append('pmin', minPrice.toString());
    if (maxPrice > 0) params.append('pmax', maxPrice.toString());
    if (minBedrooms > 0) params.append('nbmin', minBedrooms.toString());
    if (maxBedrooms > 0) params.append('nbmax', maxBedrooms.toString());
    if (minBathrooms > 0) params.append('sbmin', minBathrooms.toString());
    if (maxBathrooms > 0) params.append('sbmax', maxBathrooms.toString());
    
    params.append('sort', SORT_MAP[sortBy] || 'DateDescending');
    
    if (pageNumber > 1) {
        params.append('page', pageNumber.toString());
    }
    
    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

/**
 * Parse price from formatted string
 */
function parsePrice(priceStr) {
    if (!priceStr) return null;
    const cleaned = priceStr.replace(/[^0-9]/g, '');
    return cleaned ? parseInt(cleaned, 10) : null;
}

/**
 * Parse area from formatted string (handles both sq ft and sq m)
 */
function parseArea(areaStr) {
    if (!areaStr) return null;
    const match = areaStr.match(/([\d\s,]+)\s*(pi²|sq\.?\s*ft|m²|sq\.?\s*m)/i);
    if (!match) return null;
    
    const value = parseFloat(match[1].replace(/[\s,]/g, ''));
    const unit = match[2].toLowerCase();
    
    // Convert to sq ft if in sq m
    if (unit.includes('m')) {
        return Math.round(value * 10.764);
    }
    return Math.round(value);
}

/**
 * Extract listing data from a search result card
 */
async function extractListingFromCard(element, page) {
    try {
        const listing = {};
        
        // Get the listing URL and ID
        const linkEl = await element.$('a[href*="/propriete/"], a[href*="/property/"]');
        if (linkEl) {
            const href = await linkEl.getAttribute('href');
            listing.url = href?.startsWith('http') ? href : `${CENTRIS_BASE_URL}${href}`;
            
            // Extract Centris ID from URL
            const idMatch = href?.match(/(\d{8,})/);
            listing.id = idMatch ? idMatch[1] : null;
        }
        
        // Get MLS number
        const mlsEl = await element.$('.mls-number, [data-mls]');
        if (mlsEl) {
            listing.mlsNumber = await mlsEl.textContent();
        }
        
        // Get price
        const priceEl = await element.$('.price, .property-price, [itemprop="price"]');
        if (priceEl) {
            listing.priceFormatted = (await priceEl.textContent())?.trim();
            listing.price = parsePrice(listing.priceFormatted);
        }
        
        // Get address
        const addressEl = await element.$('.address, .property-address, [itemprop="address"]');
        if (addressEl) {
            const fullAddress = (await addressEl.textContent())?.trim();
            listing.address = {
                fullAddress,
                ...parseAddress(fullAddress)
            };
        }
        
        // Get property type
        const typeEl = await element.$('.property-type, .category');
        if (typeEl) {
            listing.propertyType = (await typeEl.textContent())?.trim();
        }
        
        // Get bedrooms/bathrooms from summary
        const summaryEl = await element.$('.property-summary, .features, .specs');
        if (summaryEl) {
            const summaryText = await summaryEl.textContent();
            
            // Parse bedrooms
            const bedroomMatch = summaryText?.match(/(\d+)\s*(ch|chambre|bed|bedroom)/i);
            if (bedroomMatch) {
                listing.bedrooms = parseInt(bedroomMatch[1], 10);
            }
            
            // Parse bathrooms
            const bathroomMatch = summaryText?.match(/(\d+)\s*(sdb|salle|bath|bathroom)/i);
            if (bathroomMatch) {
                listing.bathrooms = parseInt(bathroomMatch[1], 10);
            }
            
            // Parse living area
            const areaMatch = summaryText?.match(/([\d\s,]+)\s*(pi²|sq\.?\s*ft)/i);
            if (areaMatch) {
                listing.livingArea = parseArea(areaMatch[0]);
            }
        }
        
        // Get main image
        const imgEl = await element.$('img[src*="centris"], img[data-src*="centris"]');
        if (imgEl) {
            listing.mainImage = await imgEl.getAttribute('src') || await imgEl.getAttribute('data-src');
        }
        
        listing.transactionType = searchType === 'rent' ? 'Rent' : 'Sale';
        listing.scrapedAt = new Date().toISOString();
        
        return listing;
    } catch (error) {
        log.warning(`Error extracting listing from card: ${error.message}`);
        return null;
    }
}

/**
 * Parse address string into components
 */
function parseAddress(fullAddress) {
    if (!fullAddress) return {};
    
    const parts = fullAddress.split(',').map(p => p.trim());
    const result = {};
    
    if (parts.length >= 1) result.street = parts[0];
    if (parts.length >= 2) result.city = parts[1];
    if (parts.length >= 3) {
        // Check for postal code
        const postalMatch = parts[2].match(/[A-Z]\d[A-Z]\s*\d[A-Z]\d/i);
        if (postalMatch) {
            result.postalCode = postalMatch[0].toUpperCase();
            result.region = parts[2].replace(postalMatch[0], '').trim();
        } else {
            result.region = parts[2];
        }
    }
    if (parts.length >= 4) result.postalCode = parts[3];
    
    return result;
}

/**
 * Extract detailed information from a listing page
 */
async function extractListingDetails(page, basicListing) {
    const details = { ...basicListing };
    
    try {
        // Wait for main content
        await page.waitForSelector('.property-details, .listing-details, main', { timeout: 10000 });
        
        // Get full description
        const descEl = await page.$('.description-content, [itemprop="description"], .property-description');
        if (descEl) {
            details.description = (await descEl.textContent())?.trim();
        }
        
        // Get all features
        const featureEls = await page.$$('.features li, .amenities li, .caracteristiques li');
        if (featureEls.length > 0) {
            details.features = [];
            for (const el of featureEls) {
                const text = await el.textContent();
                if (text?.trim()) {
                    details.features.push(text.trim());
                }
            }
        }
        
        // Get property specifications
        const specRows = await page.$$('.property-specs tr, .specifications tr, .caracteristiques-table tr');
        for (const row of specRows) {
            const labelEl = await row.$('th, td:first-child, .label');
            const valueEl = await row.$('td:last-child, .value');
            
            if (labelEl && valueEl) {
                const label = (await labelEl.textContent())?.toLowerCase().trim();
                const value = (await valueEl.textContent())?.trim();
                
                if (label && value) {
                    // Map common fields
                    if (label.includes('année') || label.includes('year')) {
                        const yearMatch = value.match(/\d{4}/);
                        if (yearMatch) details.yearBuilt = parseInt(yearMatch[0], 10);
                    }
                    if (label.includes('terrain') || label.includes('lot')) {
                        details.lotSize = parseArea(value);
                    }
                    if (label.includes('superficie') || label.includes('living')) {
                        details.livingArea = parseArea(value);
                    }
                    if (label.includes('stationnement') || label.includes('parking')) {
                        const parkingMatch = value.match(/\d+/);
                        if (parkingMatch) details.parkingSpaces = parseInt(parkingMatch[0], 10);
                    }
                    if (label.includes('garage')) {
                        const garageMatch = value.match(/\d+/);
                        if (garageMatch) details.garageSpaces = parseInt(garageMatch[0], 10);
                    }
                    if (label.includes('taxe') && label.includes('munic')) {
                        details.municipalTaxes = parsePrice(value);
                    }
                    if (label.includes('taxe') && label.includes('scol')) {
                        details.schoolTaxes = parsePrice(value);
                    }
                    if (label.includes('frais') && label.includes('condo')) {
                        details.condoFees = parsePrice(value);
                    }
                }
            }
        }
        
        // Get broker info
        const brokerEl = await page.$('.broker-info, .agent-info, .courtier');
        if (brokerEl) {
            details.broker = {};
            
            const nameEl = await brokerEl.$('.broker-name, .name, h3, h4');
            if (nameEl) details.broker.name = (await nameEl.textContent())?.trim();
            
            const agencyEl = await brokerEl.$('.agency-name, .agency, .banner');
            if (agencyEl) details.broker.agency = (await agencyEl.textContent())?.trim();
            
            const phoneEl = await brokerEl.$('a[href^="tel:"], .phone');
            if (phoneEl) {
                const href = await phoneEl.getAttribute('href');
                details.broker.phone = href?.replace('tel:', '') || (await phoneEl.textContent())?.trim();
            }
        }
        
        // Get all images if requested
        if (includeImages) {
            const imageEls = await page.$$('.gallery img, .photos img, [data-gallery] img');
            if (imageEls.length > 0) {
                details.images = [];
                for (const img of imageEls) {
                    const src = await img.getAttribute('src') || await img.getAttribute('data-src');
                    if (src && !details.images.includes(src)) {
                        // Get high-res version if available
                        const highRes = src.replace(/\/\d+x\d+\//, '/1200x800/');
                        details.images.push(highRes);
                    }
                }
            }
        }
        
        // Get coordinates from map if available
        const mapEl = await page.$('[data-lat][data-lng], .map-container');
        if (mapEl) {
            const lat = await mapEl.getAttribute('data-lat');
            const lng = await mapEl.getAttribute('data-lng');
            if (lat && lng) {
                details.coordinates = {
                    latitude: parseFloat(lat),
                    longitude: parseFloat(lng)
                };
            }
        }
        
        // Calculate days on market if listing date available
        const dateEl = await page.$('.listing-date, .date-inscription, [itemprop="datePosted"]');
        if (dateEl) {
            const dateText = await dateEl.textContent();
            const dateMatch = dateText?.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
            if (dateMatch) {
                const listingDate = new Date(`${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`);
                details.listingDate = listingDate.toISOString().split('T')[0];
                details.daysOnMarket = Math.floor((Date.now() - listingDate.getTime()) / (1000 * 60 * 60 * 24));
            }
        }
        
    } catch (error) {
        log.warning(`Error extracting details for ${basicListing.url}: ${error.message}`);
    }
    
    return details;
}

/**
 * Handle consent/cookie popups
 */
async function handlePopups(page) {
    try {
        // Try common consent button selectors
        const consentSelectors = [
            'button[id*="accept"]',
            'button[class*="accept"]',
            '[data-testid="accept-cookies"]',
            '.cookie-banner button',
            '#onetrust-accept-btn-handler',
            '.consent-accept'
        ];
        
        for (const selector of consentSelectors) {
            const button = await page.$(selector);
            if (button) {
                await button.click();
                await page.waitForTimeout(500);
                break;
            }
        }
    } catch (error) {
        // Consent handling is optional, continue if it fails
    }
}

// Configure the crawler
const crawler = new PlaywrightCrawler({
    proxyConfiguration: proxyConfig,
    maxConcurrency,
    maxRequestRetries,
    requestHandlerTimeoutSecs: 120,
    navigationTimeoutSecs: 60,
    
    // Use stealth mode
    launchContext: {
        launchOptions: {
            headless: true,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        }
    },
    
    // Pre-navigation hooks for stealth
    preNavigationHooks: [
        async ({ page }) => {
            // Emulate real browser
            await page.setExtraHTTPHeaders({
                'Accept-Language': language === 'fr' ? 'fr-CA,fr;q=0.9,en;q=0.8' : 'en-CA,en;q=0.9,fr;q=0.8'
            });
            
            // Override navigator.webdriver
            await page.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => false,
                });
            });
        }
    ],
    
    async requestHandler({ request, page, enqueueLinks }) {
        const { label } = request.userData;
        
        log.info(`Processing: ${request.url}`, { label });
        
        // Handle popups
        await handlePopups(page);
        
        if (label === 'LISTING') {
            // Process individual listing page
            const basicListing = request.userData.listing;
            
            if (includeDetails) {
                const detailedListing = await extractListingDetails(page, basicListing);
                await Actor.pushData(detailedListing);
            } else {
                await Actor.pushData(basicListing);
            }
            
            listingsScraped++;
            await Actor.setStatusMessage(`Scraped ${listingsScraped}/${maxListings} listings`);
            
        } else {
            // Process search results page
            pagesScraped++;
            
            // Wait for listings to load
            await page.waitForSelector('.property-card, .listing-card, .property-thumbnail-item', { timeout: 15000 });
            
            // Get all listing cards
            const cards = await page.$$('.property-card, .listing-card, .property-thumbnail-item');
            
            log.info(`Found ${cards.length} listings on page ${pagesScraped}`);
            
            const listingsToProcess = [];
            
            for (const card of cards) {
                if (listingsScraped + listingsToProcess.length >= maxListings) {
                    break;
                }
                
                const listing = await extractListingFromCard(card, page);
                if (listing && listing.url) {
                    listingsToProcess.push(listing);
                }
            }
            
            // Enqueue detail pages if needed, otherwise save basic data
            if (includeDetails) {
                for (const listing of listingsToProcess) {
                    await crawler.addRequests([{
                        url: listing.url,
                        userData: {
                            label: 'LISTING',
                            listing
                        }
                    }]);
                }
            } else {
                for (const listing of listingsToProcess) {
                    await Actor.pushData(listing);
                    listingsScraped++;
                }
                await Actor.setStatusMessage(`Scraped ${listingsScraped}/${maxListings} listings`);
            }
            
            // Check for next page
            if (listingsScraped + listingsToProcess.length < maxListings) {
                const nextPageEl = await page.$('a[rel="next"], .pagination-next, .next-page');
                if (nextPageEl) {
                    const nextUrl = await nextPageEl.getAttribute('href');
                    if (nextUrl) {
                        const fullNextUrl = nextUrl.startsWith('http') ? nextUrl : `${CENTRIS_BASE_URL}${nextUrl}`;
                        await crawler.addRequests([{
                            url: fullNextUrl,
                            userData: { label: 'LIST' }
                        }]);
                    }
                }
            }
        }
    },
    
    async failedRequestHandler({ request, error }) {
        errors++;
        log.error(`Request failed: ${request.url}`, { error: error.message });
        
        // Store failed listings for reference
        await Actor.pushData({
            url: request.url,
            error: error.message,
            '#failed': true
        });
    }
});

// Build initial search URLs
const startUrls = [];

if (regions.length > 0) {
    // Build URLs for each region
    for (const region of regions) {
        startUrls.push({
            url: buildRegionSearchUrl(region),
            userData: { label: 'LIST', region }
        });
    }
} else {
    // Use general search URL
    startUrls.push({
        url: buildSearchUrl(),
        userData: { label: 'LIST' }
    });
}

log.info('Starting crawl with URLs:', startUrls.map(u => u.url));

// Run the crawler
await crawler.run(startUrls);

// Log final statistics
const stats = {
    listingsScraped,
    pagesScraped,
    errors,
    startTime: new Date().toISOString(),
    input: {
        searchType,
        regions,
        propertyTypes,
        priceRange: [minPrice, maxPrice],
        bedrooms: [minBedrooms, maxBedrooms],
        bathrooms: [minBathrooms, maxBathrooms]
    }
};

log.info('Scraping completed!', stats);

// Save stats to key-value store
await Actor.setValue('STATS', stats);

await Actor.exit();
