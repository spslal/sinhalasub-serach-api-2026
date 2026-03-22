# sinhalasub.lk Scraper API

Vercel serverless API to scrape movie details + download links from sinhalasub.lk

## Deploy to Vercel

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Install dependencies
npm install

# 3. Deploy
vercel deploy --prod
```

## API Endpoints

### Scrape movie
```
GET /api?url=<movie_page_url>
```

### Scrape + resolve all links to real URLs
```
GET /api?url=<movie_page_url>&resolve=true
```

### Scrape + resolve + Pixeldrain only
```
GET /api?url=<movie_page_url>&resolve=true&pixeldrain=true
```

### Resolve single redirect link
```
GET /api/resolve?url=https://sinhalasub.lk/links/wtn0gvr18x/
```

## Example Response

```json
{
  "status": "ok",
  "data": {
    "title": "Honey (2026) Sinhala Subtitles",
    "year": "2026",
    "imdb_rating": "7.3",
    "duration_min": "118",
    "poster": "https://image.tmdb.org/...",
    "genres": ["Horror", "Thriller"],
    "language": "Telugu",
    "director": "Karuna Kumar",
    "download_links": [
      {
        "host": "Pixeldrain",
        "links": [
          {
            "quality": "FHD 1080p",
            "size": "2.93 GB",
            "clicks": "61",
            "redirect_url": "https://sinhalasub.lk/links/wtn0gvr18x/",
            "real_url": "https://pixeldrain.com/u/XXXXXXXX"
          },
          {
            "quality": "HD 720p",
            "size": "1.43 GB",
            "redirect_url": "https://sinhalasub.lk/links/eauosovnnw/",
            "real_url": "https://pixeldrain.com/u/XXXXXXXX"
          }
        ]
      }
    ],
    "subtitle_links": [
      {
        "quality": "SRT",
        "redirect_url": "https://sinhalasub.lk/links/h27z53ug44/",
        "real_url": "https://drive.google.com/..."
      }
    ]
  }
}
```
