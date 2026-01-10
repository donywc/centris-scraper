/**
 * Centris.ca Quebec Real Estate Scraper
 * 
 * Scrapes property listings from Centris.ca with comprehensive filtering options.
 * Uses Playwright for JavaScript rendering and stealth mode to handle anti-bot measures.
 * 
 * @author DC Immobilier
 * @version 1.1.0
 */

import { Actor, log } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

// Centris.ca configuration
const CENTRIS_BASE_URL = 'https://www.centris.ca';

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
    'brossard': 'brossard',
    'repentigny': 'repentigny'
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
    
    if (minPrice > 0) params.append('pmin', minPrice.toString());
    if (maxPrice > 0) params.append('pmax', maxPrice.toString());
    if (minBedrooms > 0) params.append('bed', minBedrooms.toString());
    
    if (pageNumber > 1) {
        params.append('view', 'Thumbnail');
        params.append('uc', '0');
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
 * Extract listings from page using JavaScript evaluation
 */
async function extractListingsFromPage(page) {
    // Wait for the page to fully load
    await page.waitForTimeout(3000);
    
    // Try to extract data directly from the page using evaluate
    const listings = await page.evaluate(() => {
        const results = [];
        
        // Centris uses various selectors - try multiple approaches
        const cardSelectors = [
            '.property-thumbnail-item',
            '.thumbnail-item',
            '[data-id]',
            '.property-thumbnail',
            'a.property-thumbnail-summary-link',
            '.shell'
        ];
        
        let cards = [];
        for (const selector of cardSelectors) {
            cards = document.querySelectorAll(selector);
            if (cards.length > 0) break;
        }
        
        // If no cards found, try to find links to property pages
        if (cards.length === 0) {
            const allLinks = document.querySelectorAll('a[href*="/fr/"][href*="propriete"], a[href*="/en/"][href*="property"]');
            cards = allLinks;
        }
        
        cards.forEach((card) => {
            try {
                const listing = {};
                
                // Try to get the URL
                let link = card;
                if (card.tagName !== 'A') {
                    link = card.querySelector('a[href*="propriete"], a[href*="property"], a.property-thumbnail-summary-link');
                }
                
                if (link) {
                    listing.url = link.href;
                    // Extract ID from URL
                    const idMatch = listing.url.match(/(\d{7,})/);
                    if (idMatch) listing.centrisId = idMatch[1];
                }
                
                // Get price - try multiple selectors
                const priceSelectors = ['.price', '.price span', '[class*="price"]', '.property-price'];
                for (const sel of priceSelectors) {
                    const priceEl = card.querySelector(sel);
                    if (priceEl && priceEl.textContent.includes('$')) {
                        listing.priceFormatted = priceEl.textContent.trim();
                        listing.price = parseInt(listing.priceFormatted.replace(/[^0-9]/g, ''), 10) || null;
                        break;
                    }
                }
                
                // Get address
                const addressSelectors = ['.address', '.location', '[class*="address"]', '.property-address'];
                for (const sel of addressSelectors) {
                    const addressEl = card.querySelector(sel);
                    if (addressEl) {
                        listing.address = { fullAddress: addressEl.textContent.trim() };
                        break;
                    }
                }
                
                // Get property type
                const typeSelectors = ['.category', '.property-type', '[class*="category"]'];
                for (const sel of typeSelectors) {
                    const typeEl = card.querySelector(sel);
                    if (typeEl) {
                        listing.propertyType = typeEl.textContent.trim();
                        break;
                    }
                }
                
                // Get bedrooms/bathrooms from text content
                const cardText = card.textContent;
                const bedroomMatch = cardText.match(/(\d+)\s*(ch|chambre|bed|cac)/i);
                if (bedroomMatch) listing.bedrooms = parseInt(bedroomMatch[1], 10);
                
                const bathroomMatch = cardText.match(/(\d+)\s*(sdb|salle|bath)/i);
                if (bathroomMatch) listing.bathrooms = parseInt(bathroomMatch[1], 10);
                
                // Get image
                const img = card.querySelector('img');
                if (img) {
                    listing.mainImage = img.src || img.getAttribute('data-src');
                }
                
                // Only add if we have a valid URL
                if (listing.url && listing.url.includes('centris.ca')) {
                    results.push(listing);
                }
            } catch (e) {
                // Skip this card on error
            }
        });
        
        return results;
    });
    
    return listings;
}

/**
 * Extract detailed information from a listing page
 */
async function extractListingDetails(page, basicListing) {
    const details = { ...basicListing };
    
    try {
        // Wait for page to fully load
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1500);
        
        // Extract all details using page.evaluate for better performance
        const pageData = await page.evaluate(() => {
            const data = {};
            
            // Get title - with null check
            const titleEl = document.querySelector('h1, [itemprop="name"], .property-title');
            if (titleEl) data.listingTitle = titleEl.textContent?.trim() || null;
            
            // Get full address
            const addressEl = document.querySelector('[itemprop="address"], .property-address, .address-container');
            if (addressEl) {
                data.fullAddress = addressEl.textContent?.trim()?.replace(/\s+/g, ' ') || null;
            }
            
            // Get price
            const priceEl = document.querySelector('[itemprop="price"], .price, .property-price');
            if (priceEl) {
                data.priceFormatted = priceEl.textContent?.trim() || null;
                if (data.priceFormatted) {
                    data.price = parseInt(data.priceFormatted.replace(/[^0-9]/g, ''), 10) || null;
                }
            }
            
            // Get description
            const descEl = document.querySelector('[itemprop="description"], .property-description, .description');
            if (descEl) data.propertyDescription = descEl.textContent?.trim() || null;
            
            // Parse specs for specific values from body text
            const allText = document.body?.textContent || '';
            
            // Bedrooms
            const bedMatch = allText.match(/(\d+)\s*(chambre|bedroom|ch\b|cac)/i);
            if (bedMatch) data.bedrooms = parseInt(bedMatch[1], 10);
            
            // Bathrooms  
            const bathMatch = allText.match(/(\d+)\s*(salle de bain|bathroom|sdb)/i);
            if (bathMatch) data.bathrooms = parseInt(bathMatch[1], 10);
            
            // Year built
            const yearMatch = allText.match(/(année|year|built|constru)[^\d]*(\d{4})/i);
            if (yearMatch) data.yearBuilt = parseInt(yearMatch[2], 10);
            
            // Living area
            const areaMatch = allText.match(/([\d\s,]+)\s*(pi²|pc|sq\.?\s*ft)/i);
            if (areaMatch) data.livingArea = parseInt(areaMatch[1].replace(/[\s,]/g, ''), 10);
            
            // MLS Number
            const mlsMatch = allText.match(/(MLS|Centris)[^\d]*(\d{7,})/i);
            if (mlsMatch) data.mlsNumber = mlsMatch[2];
            
            // Municipal taxes
            const taxMatch = allText.match(/taxe[s]?\s*municipale[s]?[^\d]*([\d\s,]+)\s*\$/i);
            if (taxMatch) data.municipalTaxes = parseInt(taxMatch[1].replace(/[\s,]/g, ''), 10);
            
            // Get all images
            const images = [];
            document.querySelectorAll('img[src*="centris"], img[src*="mspublic"], .gallery img, [class*="photo"] img').forEach(img => {
                const src = img.src || img.getAttribute('data-src');
                if (src && !images.includes(src) && !src.includes('logo') && !src.includes('icon')) {
                    images.push(src);
                }
            });
            data.images = images.length > 0 ? images : null;
            
            // Get broker info with null checks
            const brokerEl = document.querySelector('.broker-info, .agent-info, [class*="courtier"], [class*="broker"]');
            if (brokerEl) {
                data.brokerName = brokerEl.querySelector('.name, h3, h4, strong')?.textContent?.trim() || null;
                data.brokerAgency = brokerEl.querySelector('.agency, .banner, [class*="agency"]')?.textContent?.trim() || null;
                const phoneEl = brokerEl.querySelector('a[href^="tel:"], .phone');
                if (phoneEl) data.brokerPhone = phoneEl.href?.replace('tel:', '') || phoneEl.textContent?.trim() || null;
            }
            
            return data;
        });
        
        // Merge page data into details
        if (pageData) {
            Object.assign(details, pageData);
            
            // Build proper address object
            if (pageData.fullAddress) {
                const parts = pageData.fullAddress.split(',').map(p => p.trim());
                details.address = {
                    fullAddress: pageData.fullAddress,
                    street: parts[0] || null,
                    city: parts[1] || null,
                    region: parts[2] || null
                };
            }
            
            // Build broker object
            if (pageData.brokerName || pageData.brokerAgency || pageData.brokerPhone) {
                details.broker = {
                    name: pageData.brokerName || null,
                    agency: pageData.brokerAgency || null,
                    phone: pageData.brokerPhone || null
                };
            }
            
            // Clean up temporary fields
            delete details.fullAddress;
            delete details.brokerName;
            delete details.brokerAgency;
            delete details.brokerPhone;
        }
        
    } catch (error) {
        log.warning(`Error extracting details: ${error.message}`);
    }
    
    details.transactionType = searchType === 'rent' ? 'Rent' : 'Sale';
    details.scrapedAt = new Date().toISOString();
    
    return details;
}

/**
 * Handle consent/cookie popups
 */
async function handlePopups(page) {
    try {
        const consentSelectors = [
            '#didomi-notice-agree-button',
            'button[id*="accept"]',
            'button[class*="accept"]',
            '.cookie-banner button',
            '#onetrust-accept-btn-handler'
        ];
        
        for (const selector of consentSelectors) {
            const button = await page.$(selector);
            if (button) {
                await button.click();
                await page.waitForTimeout(1000);
                break;
            }
        }
    } catch (error) {
        // Ignore popup errors
    }
}

// Configure the crawler
const crawler = new PlaywrightCrawler({
    proxyConfiguration: proxyConfig,
    maxConcurrency,
    maxRequestRetries,
    requestHandlerTimeoutSecs: 120,
    navigationTimeoutSecs: 60,
    
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
    
    preNavigationHooks: [
        async ({ page }) => {
            await page.setExtraHTTPHeaders({
                'Accept-Language': language === 'fr' ? 'fr-CA,fr;q=0.9,en;q=0.8' : 'en-CA,en;q=0.9,fr;q=0.8'
            });
            
            await page.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => false,
                });
            });
        }
    ],
    
    async requestHandler({ request, page }) {
        const { label } = request.userData;
        
        log.info(`Processing: ${request.url}`, { label });
        
        await handlePopups(page);
        
        if (label === 'LISTING') {
            // Process individual listing page
            const basicListing = request.userData.listing;
            const detailedListing = await extractListingDetails(page, basicListing);
            await Actor.pushData(detailedListing);
            
            listingsScraped++;
            await Actor.setStatusMessage(`Scraped ${listingsScraped}/${maxListings} listings`);
            
        } else {
            // Process search results page
            pagesScraped++;
            
            // Wait for page to load
            await page.waitForTimeout(5000);
            
            // Try to scroll to load more content
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
            await page.waitForTimeout(2000);
            
            // Extract listings
            const listings = await extractListingsFromPage(page);
            
            log.info(`Found ${listings.length} listings on page ${pagesScraped}`);
            
            // Process listings
            let processed = 0;
            for (const listing of listings) {
                if (listingsScraped + processed >= maxListings) {
                    break;
                }
                
                if (listing.url) {
                    if (includeDetails) {
                        await crawler.addRequests([{
                            url: listing.url,
                            userData: {
                                label: 'LISTING',
                                listing
                            }
                        }]);
                    } else {
                        listing.transactionType = searchType === 'rent' ? 'Rent' : 'Sale';
                        listing.scrapedAt = new Date().toISOString();
                        await Actor.pushData(listing);
                        listingsScraped++;
                    }
                    processed++;
                }
            }
            
            // Look for pagination / next page
            if (listingsScraped + processed < maxListings && listings.length > 0) {
                const nextPage = await page.$('a.next, a[rel="next"], .pagination a.active + a, li.next a, [class*="pagination"] a:last-child');
                if (nextPage) {
                    const nextUrl = await nextPage.getAttribute('href');
                    if (nextUrl && !nextUrl.includes('javascript')) {
                        const fullUrl = nextUrl.startsWith('http') ? nextUrl : `${CENTRIS_BASE_URL}${nextUrl}`;
                        log.info(`Found next page: ${fullUrl}`);
                        await crawler.addRequests([{
                            url: fullUrl,
                            userData: { label: 'LIST' }
                        }]);
                    }
                }
            }
            
            if (!includeDetails) {
                await Actor.setStatusMessage(`Scraped ${listingsScraped}/${maxListings} listings`);
            }
        }
    },
    
    async failedRequestHandler({ request, error }) {
        errors++;
        log.error(`Request failed: ${request.url}`, { error: error.message });
        
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
    for (const region of regions) {
        startUrls.push({
            url: buildRegionSearchUrl(region),
            userData: { label: 'LIST', region }
        });
    }
} else {
    startUrls.push({
        url: buildRegionSearchUrl('montreal'),
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

await Actor.setValue('STATS', stats);

await Actor.exit();
