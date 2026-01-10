# Use Apify's Playwright image with Chrome
FROM apify/actor-node-playwright-chrome:20

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm --quiet set progress=false \
    && npm install --omit=dev --omit=optional \
    && echo "Dependencies installed successfully"

# Copy actor files
COPY . ./

# Set environment variables for Playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV NODE_ENV=production

# Run the actor
CMD ["npm", "start"]
