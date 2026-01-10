# Centris.ca Quebec Real Estate Scraper

[![Apify Actor](https://img.shields.io/badge/Apify-Actor-green)](https://apify.com)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Scrape property listings from **Centris.ca**, Quebec's largest real estate platform. This actor supports comprehensive filtering by location, price, property type, bedrooms, bathrooms, and more.

## 🏠 Features

- **Multi-region search**: Search Montreal, Quebec City, Laval, and all Quebec regions
- **Property type filtering**: Houses, condos, plexes, land, commercial, farms, cottages
- **Advanced filters**: Price range, bedrooms, bathrooms, living area, lot size, year built
- **Feature filtering**: Pool, garage, waterfront, basement, A/C, elevator
- **Bilingual support**: French (default) and English
- **Detailed extraction**: Full property details, broker info, images, taxes
- **Anti-bot handling**: Playwright with stealth mode for reliable scraping

## 📋 Input Schema

### Basic Settings

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `searchType` | string | `buy` | `buy` or `rent` |
| `regions` | array | `["Montreal"]` | Quebec regions to search |
| `neighborhoods` | array | `[]` | Specific neighborhoods |
| `propertyTypes` | array | `[]` | Property types (house, condo, plex, etc.) |
| `language` | string | `fr` | `fr` (French) or `en` (English) |

### Price & Room Filters

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `minPrice` | integer | `0` | Minimum price in CAD |
| `maxPrice` | integer | `0` | Maximum price (0 = no limit) |
| `minBedrooms` | integer | `0` | Minimum bedrooms |
| `maxBedrooms` | integer | `0` | Maximum bedrooms (0 = no limit) |
| `minBathrooms` | integer | `0` | Minimum bathrooms |
| `maxBathrooms` | integer | `0` | Maximum bathrooms (0 = no limit) |

### Property Size Filters

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `minLivingArea` | integer | `0` | Min living area (sq ft) |
| `maxLivingArea` | integer | `0` | Max living area (sq ft) |
| `minLotSize` | integer | `0` | Min lot size (sq ft) |
| `maxLotSize` | integer | `0` | Max lot size (sq ft) |
| `yearBuiltMin` | integer | `0` | Minimum year built |
| `yearBuiltMax` | integer | `0` | Maximum year built |

### Scraping Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maxListings` | integer | `100` | Max listings to scrape |
| `includeDetails` | boolean | `true` | Scrape full property details |
| `includeImages` | boolean | `true` | Include all image URLs |
| `sortBy` | string | `date_desc` | Sort order |
| `listingAge` | string | `any` | Listing age filter |

## 📤 Output Schema

Each listing includes:

```json
{
  "id": "12345678",
  "url": "https://www.centris.ca/fr/propriete/12345678",
  "title": "Maison à vendre",
  "address": {
    "street": "123 Rue Example",
    "city": "Montreal",
    "neighborhood": "Plateau Mont-Royal",
    "region": "QC",
    "postalCode": "H2T 1A1",
    "fullAddress": "123 Rue Example, Montreal, QC H2T 1A1"
  },
  "price": 750000,
  "priceFormatted": "750 000 $",
  "propertyType": "Maison",
  "transactionType": "Sale",
  "bedrooms": 3,
  "bathrooms": 2,
  "livingArea": 1500,
  "lotSize": 5000,
  "yearBuilt": 1920,
  "features": ["Garage", "Fireplace", "Basement"],
  "description": "Beautiful property...",
  "images": ["https://..."],
  "broker": {
    "name": "John Doe",
    "agency": "Example Realty",
    "phone": "514-555-0123"
  },
  "mlsNumber": "12345678",
  "municipalTaxes": 4500,
  "schoolTaxes": 800,
  "coordinates": {
    "latitude": 45.5231,
    "longitude": -73.5812
  },
  "scrapedAt": "2025-01-09T12:00:00Z"
}
```

## 🚀 Usage Examples

### Example 1: Montreal Condos Under $500K

```json
{
  "searchType": "buy",
  "regions": ["Montreal"],
  "propertyTypes": ["condo"],
  "maxPrice": 500000,
  "minBedrooms": 2,
  "maxListings": 50
}
```

### Example 2: Houses in Multiple Regions

```json
{
  "searchType": "buy",
  "regions": ["Laval", "Longueuil", "Brossard"],
  "propertyTypes": ["house"],
  "minPrice": 400000,
  "maxPrice": 800000,
  "minBedrooms": 3,
  "features": ["garage"],
  "maxListings": 100
}
```

### Example 3: Investment Properties (Plexes)

```json
{
  "searchType": "buy",
  "regions": ["Montreal"],
  "neighborhoods": ["Verdun", "Rosemont", "Villeray"],
  "propertyTypes": ["plex"],
  "listingAge": "7days",
  "maxListings": 50
}
```

### Example 4: Rentals in Quebec City

```json
{
  "searchType": "rent",
  "regions": ["Quebec City"],
  "maxPrice": 2000,
  "minBedrooms": 2,
  "language": "fr",
  "maxListings": 100
}
```

## 🛠️ Local Development

```bash
# Install Apify CLI
npm install -g apify-cli

# Create from this template
apify create my-centris-scraper --template empty
cd my-centris-scraper

# Copy files from this actor

# Install dependencies
npm install

# Run locally
apify run

# Run with specific input
apify run --input-file=input.json
```

## 📦 Deployment

```bash
# Login to Apify
apify login

# Deploy to Apify platform
apify push
```

## ⚙️ Proxy Configuration

For best results, use **residential proxies**:

```json
{
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"]
  }
}
```

## ⚠️ Important Notes

1. **Rate Limiting**: The actor uses conservative defaults (3 concurrent requests) to avoid detection
2. **Residential Proxies**: Recommended for reliable scraping
3. **Respect Terms of Service**: Use responsibly and respect Centris.ca's terms
4. **Data Accuracy**: Property data may change; always verify before making decisions

## 🇨🇦 Quebec Regions Supported

- Montreal / Montréal
- Quebec City / Québec
- Laval
- Longueuil
- Gatineau
- Sherbrooke
- Trois-Rivières
- Saguenay
- Lévis
- Terrebonne
- Brossard
- Repentigny
- Drummondville
- Saint-Jérôme
- Granby
- And more...

## 📄 License

MIT License - See [LICENSE](LICENSE) for details.

---

**Built for DC Immobilier** 🏠

For questions or support, contact the development team.
