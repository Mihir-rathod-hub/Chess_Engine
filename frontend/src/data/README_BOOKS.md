# Strategic Chess — Books Catalogue Guide

This directory contains the central data catalogue for the Strategic Chess Books Library in `books.json`.

## How to Add a New Book

To add a new book to the library, simply append a new JSON object to the array in `frontend/src/data/books.json`. The user interface will automatically:
- Update the total book count.
- Add any newly introduced categories to the topic filter dropdown.
- Enable live search across the new book's title, author, summary, and categories.
- Render the book card and full details view.

### Schema & Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | **Yes** | A unique, slugified string identifier (e.g. `"my-system-aron-nimzowitsch"`). Must be unique across all books. |
| `title` | `string` | **Yes** | Official book title (e.g. `"Chess Fundamentals"`). |
| `author` | `string` | **Yes** | Author name or names (e.g. `"José Raúl Capablanca"`). |
| `level` | `string` | **Yes** | Difficulty level. Must be one of: `"Beginner"`, `"Intermediate"`, `"Advanced"`, or `"All Levels"`. |
| `categories` | `string[]` | **Yes** | Array of topics (e.g. `["Strategy", "Fundamentals"]`). |
| `summary` | `string` | **Yes** | Comprehensive overview of the book's contents, teaching goals, and prerequisites (~80–150 words). |
| `url` | `string \| null` | **Yes** | Valid `https://` destination URL where users can read or borrow the book online. If unverified or not yet available, set to `null` to safely disable the "Read Book" button. |
| `coverUrl` | `string \| null` | *Optional* | URL to cover image, or `null` to use the built-in styled chess book graphic. |
| `sourceName` | `string` | *Optional* | Name of hosting library or publisher (e.g. `"Project Gutenberg"`, `"Internet Archive"`). |
| `language` | `string` | *Optional* | Language of the work (e.g. `"English"`). Defaults gracefully if omitted. |
| `publicationYear` | `number \| null` | *Optional* | Year the work or edition was published (e.g. `1921`). |
| `availabilityNote` | `string` | *Optional* | Access note (e.g. `"Public domain. Free online reading."`, `"Free borrowable copy."`). |

### Template to Copy & Paste

```json
{
  "id": "book-unique-slug",
  "title": "Title of the Chess Book",
  "author": "Author Name",
  "level": "Intermediate",
  "categories": [
    "Strategy",
    "Middlegame"
  ],
  "summary": "Detailed summary describing the contents, instructive value, and who should read this book...",
  "url": "https://example.com/verified-reading-link",
  "coverUrl": null,
  "sourceName": "Internet Archive",
  "language": "English",
  "publicationYear": 1950,
  "availabilityNote": "Free online reading."
}
```
