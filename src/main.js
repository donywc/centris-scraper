/**
 * Centris.ca Quebec Real Estate Scraper
 * 
 * Scrapes property listings from Centris.ca with comprehensive filtering options.
 * Uses Playwright for JavaScript rendering and applies filters post-scrape
 * since Centris uses complex AJAX/POST-based filtering.
 * 
 * @author DC Immobilier
 * @version 2.0.0
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
    'repentigny': 'repentigny',
    'drummondville': 'drummondville',
    'saint-jean-sur-richelieu': 'saint-jean-sur-richelieu',
    'saint-jerome': 'saint-jerome',
    'granby': 'granby',
    'blainville': 'blainville',
    'saint-hyacinthe': 'saint-hyacinthe',
    'shawinigan': 'shawinigan',
    'dollard-des-ormeaux': 'dollard-des-ormeaux',
    'rimouski': 'rimouski',
    'victoriaville': 'victoriaville',
    'saint-eustache': 'saint-eustache',
    'mascouche': 'mascouche'
};

// Property type mappings
const PROPERTY_TYPE_MAP = {
    'house': ['maison', 'house', 'detached', 'unifamiliale'],
    'condo': ['condo', 'condominium', 'appartement', 'apartment'],
    'plex': ['plex', 'duplex', 'triplex', 'quadruplex', 'multiplex', 'revenue'],
    'land': ['terrain', 'land', 'lot'],
    'commercial': ['commercial', 'industriel', 'industrial'],
    'farm': ['ferme', 'farm', 'agricole'],
    'cottage': ['chalet', 'cottage']
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
let listingsFiltered = 0;
let pagesScraped = 0;
let errors = 0;

log.info('🏠 Starting Centris.ca scraper v2.0 with configuration:', {
    searchType,
    propertyTypes,
    regions,
    priceRange: { min: minPrice, max: maxPrice },
    bedrooms: { min: minBedrooms, max: maxBedrooms },
    bathrooms: { min: minBathrooms, max: maxBathrooms },
    maxListings,
    language
});

// Log filter criteria for debugging
log.info('📋 Filter criteria:', {
    minPrice: minPrice || 'none',
    maxPrice: maxPrice || 'none',
    minBedrooms: minBedrooms || 'none',
    maxBedrooms: maxBedrooms || 'none',
    minBathrooms: minBathrooms || 'none',
    maxBathrooms: maxBathrooms || 'none',
    propertyTypes: propertyTypes.length > 0 ? propertyTypes : 'all'
});

// Create proxy configuration
const proxyConfig = await Actor.createProxyConfiguration(proxyConfiguration);

/**
 * Check if a listing matches the filter criteria
 */
function matchesFilters(listing) {
    // Price filter
    if (minPrice > 0 && listing.price && listing.price < minPrice) {
        log.debug(`Filtered out ${listing.centrisId}: price ${listing.price} < minPrice ${minPrice}`);
        return false;
    }
    if (maxPrice > 0 && listing.price && listing.price > maxPrice) {
        log.debug(`Filtered out ${listing.centrisId}: price ${listing.price} > maxPrice ${maxPrice}`);
        return false;
    }
    
    // Bedrooms filter
    if (minBedrooms > 0 && listing.bedrooms !== null && listing.bedrooms < minBedrooms) {
        log.debug(`Filtered out ${listing.centrisId}: bedrooms ${listing.bedrooms} < minBedrooms ${minBedrooms}`);
        return false;
    }
    if (maxBedrooms > 0 && listing.bedrooms !== null && listing.bedrooms > maxBedrooms) {
        log.debug(`Filtered out ${listing.centrisId}: bedrooms ${listing.bedrooms} > maxBedrooms ${maxBedrooms}`);
        return false;
    }
    
    // Bathrooms filter
    if (minBathrooms > 0 && listing.bathrooms !== null && listing.bathrooms < minBathrooms) {
        log.debug(`Filtered out ${listing.centrisId}: bathrooms ${listing.bathrooms} < minBathrooms ${minBathrooms}`);
        return false;
    }
    if (maxBathrooms > 0 && listing.bathrooms !== null && listing.bathrooms > maxBathrooms) {
        log.debug(`Filtered out ${listing.centrisId}: bathrooms ${listing.bathrooms} > maxBathrooms ${maxBathrooms}`);
        return false;
    }
    
    // Living area filter
    if (minLivingArea > 0 && listing.livingArea !== null && listing.livingArea < minLivingArea) {
        log.debug(`Filtered out ${listing.centrisId}: livingArea ${listing.livingArea} < minLivingArea ${minLivingArea}`);
        return false;
    }
    if (maxLivingArea > 0 && listing.livingArea !== null && listing.livingArea > maxLivingArea) {
        log.debug(`Filtered out ${listing.centrisId}: livingArea ${listing.livingArea} > maxLivingArea ${maxLivingArea}`);
        return false;
    }
    
    // Year built filter
    if (yearBuiltMin > 0 && listing.yearBuilt !== null && listing.yearBuilt < yearBuiltMin) {
        log.debug(`Filtered out ${listing.centrisId}: yearBuilt ${listing.yearBuilt} < yearBuiltMin ${yearBuiltMin}`);
        return false;
    }
    if (yearBuiltMax > 0 && listing.yearBuilt !== null && listing.yearBuilt > yearBuiltMax) {
        log.debug(`Filtered out ${listing.centrisId}: yearBuilt ${listing.yearBuilt} > yearBuiltMax ${yearBuiltMax}`);
        return false;
    }
    
    // Property type filter
    if (propertyTypes.length > 0 && listing.propertyType) {
        const listingType = listing.propertyType.toLowerCase();
        let typeMatched = false;
        
        for (const requestedType of propertyTypes) {
            const typeVariants = PROPERTY_TYPE_MAP[requestedType.toLowerCase()] || [requestedType.toLowerCase()];
            for (const variant of typeVariants) {
                if (listingType.includes(variant)) {
                    typeMatched = true;
                    break;
                }
            }
            if (typeMatched) break;
        }
        
        if (!typeMatched) {
            log.debug(`Filtered out ${listing.centrisId}: propertyType "${listing.propertyType}" doesn't match ${propertyTypes}`);
            return false;
        }
    }
    
    return true;
}

/**
 * Build region-specific search URL
 * Note: Centris filtering is primarily done via POST/AJAX, so URL params have limited effect
 * We scrape more than needed and filter locally for accuracy
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
    
    // Add URL params as hints (may not work on all pages but helps in some cases)
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
 * Parse number from string (for bedrooms, bathrooms, etc)
 */
function parseNumber(str) {
    if (!str) return null;
    const match = str.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
}

/**
 * Extract listings from page using JavaScript evaluation
 */
async function extractListingsFromPage(page) {
    // Wait for the page to fully load
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    
    // Scroll to trigger lazy loading
    await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight / 2);
    });
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(2000);
    
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
            '.shell',
            '.property-thumbnail-summary'
        ];
        
        let cards = [];
        for (const selector of cardSelectors) {
            cards = document.querySelectorAll(selector);
            if (cards.length > 0) {
                console.log(`Found ${cards.length} cards with selector: ${selector}`);
                break;
            }
        }
        
        // If no cards found, try to find links to property pages
        if (cards.length === 0) {
            const allLinks = document.querySelectorAll('a[href*="/fr/"][href*="~a-vendre~"], a[href*="/en/"][href*="~for-sale~"]');
            cards = allLinks;
            console.log(`Found ${cards.length} property links`);
        }
        
        cards.forEach((card) => {
            try {
                const listing = {};
                
                // Try to get the URL
                let link = card;
                if (card.tagName !== 'A') {
                    link = card.querySelector('a[href*="~a-vendre~"], a[href*="~for-sale~"], a[href*="~a-louer~"], a[href*="~for-rent~"], a.property-thumbnail-summary-link');
                }
                
                if (link && link.href) {
                    listing.url = link.href;
                    // Extract ID from URL - Centris IDs are typically 8 digits
                    const idMatch = listing.url.match(/\/(\d{7,8})(?:[?#]|$)/);
                    if (idMatch) listing.centrisId = idMatch[1];
                }
                
                // Skip if no valid URL
                if (!listing.url || !listing.url.includes('centris.ca')) return;
                
                // Get price - try multiple selectors
                const priceSelectors = [
                    '.price', 
                    '.price span', 
                    '[class*="price"]', 
                    '.property-price',
                    '.listing-price',
                    'span[itemprop="price"]'
                ];
                
                for (const selector of priceSelectors) {
                    const priceEl = card.querySelector(selector);
                    if (priceEl) {
                        listing.priceFormatted = priceEl.textContent?.trim();
                        if (listing.priceFormatted) break;
                    }
                }
                
                // Get address
                const addressSelectors = [
                    '.address',
                    '.property-address', 
                    '[class*="address"]',
                    '.location',
                    'span[itemprop="address"]'
                ];
                
                for (const selector of addressSelectors) {
                    const addrEl = card.querySelector(selector);
                    if (addrEl) {
                        listing.addressText = addrEl.textContent?.trim();
                        if (listing.addressText) break;
                    }
                }
                
                // Get property type
                const typeSelectors = [
                    '.category',
                    '.property-type',
                    '[class*="category"]',
                    '.property-thumbnail-summary-type'
                ];
                
                for (const selector of typeSelectors) {
                    const typeEl = card.querySelector(selector);
                    if (typeEl) {
                        listing.propertyType = typeEl.textContent?.trim();
                        if (listing.propertyType) break;
                    }
                }
                
                // Get bedrooms/bathrooms from features text
                const featureSelectors = [
                    '.cac',
                    '.features',
                    '[class*="feature"]',
                    '.property-thumbnail-summary-bedroom',
                    '.property-thumbnail-summary-bathroom'
                ];
                
                let featuresText = '';
                for (const selector of featureSelectors) {
                    const featureEls = card.querySelectorAll(selector);
                    featureEls.forEach(el => {
                        featuresText += ' ' + (el.textContent || '');
                    });
                }
                
                // Also check for specific bedroom/bathroom elements
                const bedroomEl = card.querySelector('[class*="bedroom"], [class*="chambre"]');
                const bathroomEl = card.querySelector('[class*="bathroom"], [class*="salle"]');
                
                if (bedroomEl) {
                    const bedMatch = bedroomEl.textContent?.match(/(\d+)/);
                    if (bedMatch) listing.bedrooms = parseInt(bedMatch[1], 10);
                }
                
                if (bathroomEl) {
                    const bathMatch = bathroomEl.textContent?.match(/(\d+)/);
                    if (bathMatch) listing.bathrooms = parseInt(bathMatch[1], 10);
                }
                
                // Parse from features text if not found
                if (!listing.bedrooms) {
                    const bedMatch = featuresText.match(/(\d+)\s*(?:ch|bed|chambre|bedroom)/i);
                    if (bedMatch) listing.bedrooms = parseInt(bedMatch[1], 10);
                }
                
                if (!listing.bathrooms) {
                    const bathMatch = featuresText.match(/(\d+)\s*(?:sdb|bath|salle|bathroom)/i);
                    if (bathMatch) listing.bathrooms = parseInt(bathMatch[1], 10);
                }
                
                // Get main image
                const imgSelectors = [
                    'img.property-thumbnail-summary-link-image',
                    'img[src*="centris"]',
                    'img[data-src*="centris"]',
                    'img.property-photo',
                    'img'
                ];
                
                for (const selector of imgSelectors) {
                    const imgEl = card.querySelector(selector);
                    if (imgEl) {
                        listing.mainImage = imgEl.src || imgEl.dataset?.src;
                        if (listing.mainImage && listing.mainImage.includes('centris')) break;
                    }
                }
                
                if (listing.url) {
                    results.push(listing);
                }
            } catch (err) {
                console.error('Error extracting card:', err);
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
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    
    const details = await page.evaluate(() => {
        const data = {};
        
        // Price
        const priceEl = document.querySelector('.price, [class*="price"], [itemprop="price"]');
        if (priceEl) {
            data.priceFormatted = priceEl.textContent?.trim();
        }
        
        // Address
        const addressEl = document.querySelector('.address, [itemprop="address"], .property-address');
        if (addressEl) {
            data.fullAddress = addressEl.textContent?.trim();
        }
        
        // Property type / category
        const categoryEl = document.querySelector('.category, .property-type, h1[itemprop="category"]');
        if (categoryEl) {
            data.propertyType = categoryEl.textContent?.trim();
        }
        
        // Features section - bedrooms, bathrooms, living area
        const allText = document.body.innerText || '';
        
        // Bedrooms
        const bedroomPatterns = [
            /(\d+)\s*chambre/i,
            /(\d+)\s*ch\b/i,
            /(\d+)\s*bedroom/i,
            /(\d+)\s*bed\b/i,
            /chambres?\s*[:=]?\s*(\d+)/i
        ];
        
        for (const pattern of bedroomPatterns) {
            const match = allText.match(pattern);
            if (match) {
                data.bedrooms = parseInt(match[1], 10);
                break;
            }
        }
        
        // Bathrooms  
        const bathroomPatterns = [
            /(\d+)\s*salle/i,
            /(\d+)\s*sdb/i,
            /(\d+)\s*bathroom/i,
            /(\d+)\s*bath\b/i,
            /salles?\s*de\s*bain\s*[:=]?\s*(\d+)/i
        ];
        
        for (const pattern of bathroomPatterns) {
            const match = allText.match(pattern);
            if (match) {
                data.bathrooms = parseInt(match[1], 10);
                break;
            }
        }
        
        // Living area
        const areaPatterns = [
            /superficie\s*(?:habitable)?\s*[:=]?\s*([\d\s,]+)\s*(?:pi|pc|sf|sqft)/i,
            /([\d\s,]+)\s*(?:pi|pc|sf|sqft)/i,
            /living\s*area\s*[:=]?\s*([\d\s,]+)/i
        ];
        
        for (const pattern of areaPatterns) {
            const match = allText.match(pattern);
            if (match) {
                const areaStr = match[1].replace(/[,\s]/g, '');
                data.livingArea = parseInt(areaStr, 10);
                break;
            }
        }
        
        // Year built
        const yearPatterns = [
            /année\s*(?:de\s*)?construction\s*[:=]?\s*(\d{4})/i,
            /built\s*(?:in)?\s*[:=]?\s*(\d{4})/i,
            /(\d{4})\s*(?:construction|built)/i
        ];
        
        for (const pattern of yearPatterns) {
            const match = allText.match(pattern);
            if (match) {
                data.yearBuilt = parseInt(match[1], 10);
                break;
            }
        }
        
        // Description
        const descEl = document.querySelector('.description, [itemprop="description"], .property-description');
        if (descEl) {
            data.description = descEl.textContent?.trim().substring(0, 1000);
        }
        
        // Images
        const images = [];
        document.querySelectorAll('img[src*="centris"], img[data-src*="centris"]').forEach(img => {
            const src = img.src || img.dataset?.src;
            if (src && !images.includes(src) && src.includes('media.ashx')) {
                images.push(src);
            }
        });
        data.images = images.slice(0, 20);
        
        // Broker info
        const brokerEl = document.querySelector('.broker-info, .agent-info, [class*="broker"]');
        if (brokerEl) {
            data.brokerInfo = brokerEl.textContent?.trim().substring(0, 200);
        }
        
        return data;
    });
    
    return { ...basicListing, ...details };
}

// Create the crawler
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
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu'
            ]
        }
    },
    
    async requestHandler({ request, page, enqueueLinks }) {
        const url = request.url;
        const isListingPage = request.userData?.isListingPage;
        const basicData = request.userData?.basicData;
        
        log.info(`Processing: ${url}`);
        
        if (isListingPage && basicData) {
            // Extract detailed info from individual listing
            try {
                const detailedListing = await extractListingDetails(page, basicData);
                
                // Parse price if needed
                if (!detailedListing.price && detailedListing.priceFormatted) {
                    detailedListing.price = parsePrice(detailedListing.priceFormatted);
                }
                
                // Apply filters
                if (matchesFilters(detailedListing)) {
                    detailedListing.transactionType = searchType === 'rent' ? 'Rental' : 'Sale';
                    detailedListing.scrapedAt = new Date().toISOString();
                    
                    await Actor.pushData(detailedListing);
                    listingsScraped++;
                    log.info(`✅ Saved listing ${detailedListing.centrisId} - $${detailedListing.price} - ${detailedListing.bedrooms || '?'} bed`);
                } else {
                    listingsFiltered++;
                    log.info(`🚫 Filtered out listing ${detailedListing.centrisId} - $${detailedListing.price} (outside criteria)`);
                }
                
            } catch (err) {
                log.error(`Error extracting details from ${url}: ${err.message}`);
                errors++;
            }
            
        } else {
            // Search results page - extract listings
            pagesScraped++;
            
            try {
                const listings = await extractListingsFromPage(page);
                log.info(`Found ${listings.length} listings on page`);
                
                // Calculate how many more we need (accounting for filtering)
                // Scrape extra to account for filtered results
                const remainingNeeded = (maxListings - listingsScraped) * 2;
                
                for (const listing of listings) {
                    if (listingsScraped >= maxListings) {
                        log.info(`Reached max listings limit: ${maxListings}`);
                        break;
                    }
                    
                    // Quick pre-filter based on price if available
                    if (listing.priceFormatted) {
                        listing.price = parsePrice(listing.priceFormatted);
                        
                        // Quick price check before detailed scraping
                        if (minPrice > 0 && listing.price && listing.price < minPrice) {
                            log.debug(`Skipping ${listing.centrisId}: price ${listing.price} below min ${minPrice}`);
                            listingsFiltered++;
                            continue;
                        }
                        if (maxPrice > 0 && listing.price && listing.price > maxPrice) {
                            log.debug(`Skipping ${listing.centrisId}: price ${listing.price} above max ${maxPrice}`);
                            listingsFiltered++;
                            continue;
                        }
                    }
                    
                    if (listing.url && includeDetails) {
                        // Queue for detailed scraping
                        await crawler.addRequests([{
                            url: listing.url,
                            userData: {
                                isListingPage: true,
                                basicData: listing
                            }
                        }]);
                    } else if (listing.url) {
                        // Save basic data with filters
                        listing.price = listing.price || parsePrice(listing.priceFormatted);
                        
                        if (matchesFilters(listing)) {
                            listing.transactionType = searchType === 'rent' ? 'Rental' : 'Sale';
                            listing.scrapedAt = new Date().toISOString();
                            
                            await Actor.pushData(listing);
                            listingsScraped++;
                        } else {
                            listingsFiltered++;
                        }
                    }
                }
                
                // Try to find and enqueue next page if we need more listings
                if (listingsScraped < maxListings && listings.length > 0) {
                    const nextPageSelectors = [
                        'a.next',
                        'a[rel="next"]',
                        '.pagination a:last-child',
                        'a[title*="suivant"]',
                        'a[title*="next"]',
                        '.pager-next a'
                    ];
                    
                    for (const selector of nextPageSelectors) {
                        try {
                            const nextLink = await page.$(selector);
                            if (nextLink) {
                                const href = await nextLink.getAttribute('href');
                                if (href) {
                                    log.info(`Found next page: ${href}`);
                                    await crawler.addRequests([{
                                        url: href.startsWith('http') ? href : `${CENTRIS_BASE_URL}${href}`,
                                        userData: { isListingPage: false }
                                    }]);
                                    break;
                                }
                            }
                        } catch (e) {
                            // Selector not found, try next
                        }
                    }
                }
                
            } catch (err) {
                log.error(`Error extracting from search page ${url}: ${err.message}`);
                errors++;
            }
        }
    },
    
    async failedRequestHandler({ request, error }) {
        log.error(`Request failed: ${request.url}`, { error: error.message });
        errors++;
    }
});

// Build initial URLs for each region
const startUrls = regions.map(region => ({
    url: buildRegionSearchUrl(region),
    userData: { isListingPage: false }
}));

log.info(`Starting crawl with ${startUrls.length} region(s):`, startUrls.map(u => u.url));

// Run the crawler
await crawler.run(startUrls);

// Log final stats
log.info('🏁 Scraping complete!', {
    listingsSaved: listingsScraped,
    listingsFiltered: listingsFiltered,
    pagesScraped,
    errors,
    filters: {
        priceRange: `$${minPrice || 0} - $${maxPrice || '∞'}`,
        bedrooms: `${minBedrooms || 0} - ${maxBedrooms || '∞'}`,
        bathrooms: `${minBathrooms || 0} - ${maxBathrooms || '∞'}`,
        propertyTypes: propertyTypes.length > 0 ? propertyTypes.join(', ') : 'all'
    }
});

await Actor.exit();
