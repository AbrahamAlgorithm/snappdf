import type { Route } from './router';
import { TOOLS, type ToolId } from './site';

// what search engines and link previews read for each page. vite.config.ts loads this too, so relative imports only

export const SITE_URL = 'https://snappdf.abrahamalgorithm.tech';
const OG_IMAGE = `${SITE_URL}/og.jpg`;
const AUTHOR = { name: 'Abraham Folorunso', url: 'https://abrahamalgorithm.tech' };

export type Faq = { q: string; a: string };
export type Step = { title: string; text: string };
export type Guide = { title: string; description: string; howTo: string; steps: Step[]; faqs: Faq[] };

export type PageMeta = {
  path: string;
  title: string;
  description: string;
  heading: string;
  tool?: ToolId;
  noindex?: boolean;
};

const notUploaded = (thing: string) => ({ q: `Is my ${thing} uploaded?`, a: `No. Everything happens in your browser, so your ${thing} never leaves your device.` });

export const TOOL_GUIDES: Record<ToolId, Guide> = {
  'image-to-pdf': {
    title: 'Free Image to PDF Converter: JPG, PNG, HEIC to PDF · snappdf',
    description:
      'Convert JPG, PNG, HEIC and other images to one PDF, free. Reorder, rotate and crop pages, or scan paper with your phone camera. Nothing is uploaded.',
    howTo: 'How to convert images to PDF',
    steps: [
      { title: 'Add your images', text: 'Choose JPG, PNG, HEIC, WEBP, GIF or BMP files, or tap Take photo on your phone to scan a page.' },
      { title: 'Arrange the pages', text: 'Drag to reorder, and rotate or crop any image. Set the image quality to balance sharpness and file size.' },
      { title: 'Download your PDF', text: 'Name the file and save it. Each image becomes an A4 page.' },
    ],
    faqs: [
      {
        q: 'Can I turn iPhone HEIC photos into a PDF?',
        a: 'Yes. HEIC photos are converted right in your browser, so there’s no need to change your camera settings or convert them first.',
      },
      {
        q: 'Can I scan a document with my phone?',
        a: 'Yes. Tap Take photo and snap the page. snappdf finds the page in the photo, crops it and straightens it, like a scanner app.',
      },
      { q: 'Are my photos uploaded?', a: 'No. The PDF is made on your device, so your photos never leave it. After your first visit it even works offline.' },
      { q: 'Will the PDF have a watermark?', a: 'No. snappdf is free and open source, and never adds watermarks.' },
    ],
  },
  'merge-pdf': {
    title: 'Merge PDF Files Free: Combine PDFs into One · snappdf',
    description: 'Combine PDF files into one, free. Put them in order, preview every page and download a single PDF. No uploads, no watermarks, no sign-up.',
    howTo: 'How to merge PDF files',
    steps: [
      { title: 'Choose your PDFs', text: 'Add two or more PDF files from your device.' },
      { title: 'Put them in order', text: 'Drag the files into the order you want. Open a file to see all of its pages.' },
      { title: 'Download the merged PDF', text: 'Name it and save it. Pages are copied as they are, so nothing loses quality.' },
    ],
    faqs: [
      { q: 'Is it safe to merge confidential PDFs?', a: 'Yes. Your PDFs are merged on your device and never uploaded, so nobody else ever sees them.' },
      { q: 'Does merging lower the quality?', a: 'No. Every page is copied into the new PDF as it is, so text stays sharp and selectable.' },
      { q: 'Can I merge PDFs on my phone?', a: 'Yes. snappdf works in the browser on Android, iPhone, Windows, Mac and Linux, with nothing to install.' },
    ],
  },
  'pdf-splitter': {
    title: 'Split PDF Free: Extract Pages from a PDF · snappdf',
    description:
      'Pick the pages you need from a PDF and save them as a new file, free. Preview every page and select single pages or a range. Nothing is uploaded.',
    howTo: 'How to split a PDF',
    steps: [
      { title: 'Choose a PDF', text: 'Add the PDF you want to take pages from.' },
      { title: 'Pick the pages', text: 'Tap pages to select them, or enter a range like 3 to 7. Open any page to see it full size.' },
      { title: 'Save the new PDF', text: 'Download just the pages you picked, as a new PDF.' },
    ],
    faqs: [
      { q: 'Can I extract a single page from a PDF?', a: 'Yes. Select just that page and save it, and you get a one-page PDF.' },
      { q: 'Does splitting change the quality?', a: 'No. The pages are copied as they are, with no loss in quality.' },
      notUploaded('PDF'),
    ],
  },
  'sign-pdf': {
    title: 'Sign PDF Free: Add Your Signature to a PDF · snappdf',
    description: 'Sign a PDF for free. Draw or upload your signature, place it on any page, then resize and rotate it. Your document never leaves your device.',
    howTo: 'How to sign a PDF',
    steps: [
      { title: 'Open your document', text: 'Choose a PDF, or a photo of a document.' },
      {
        title: 'Add your signature',
        text: 'Draw it with your finger, mouse or trackpad, or upload a picture of it. snappdf can remove the white background so only the ink shows.',
      },
      { title: 'Place it and download', text: 'Drag it into place, resize or rotate it, and save the signed PDF.' },
    ],
    faqs: [
      { q: 'Can I sign a PDF on my phone?', a: 'Yes. Draw your signature with your finger and place it anywhere on the page.' },
      {
        q: 'Can I use a photo of my signature?',
        a: 'Yes. Sign a piece of paper, take a photo and upload it. Turn on Remove white background and only the ink goes on the page.',
      },
      {
        q: 'Does it add a digital certificate?',
        a: 'No. snappdf puts your signature on the page, like signing a printed copy. If someone needs a certificate-based signature, check with them first.',
      },
      notUploaded('document'),
    ],
  },
  'text-to-pdf': {
    title: 'Text to PDF Converter: TXT to PDF, Free · snappdf',
    description: 'Type, paste or open a .txt file and save it as a clean, readable PDF. Free, works offline, and nothing you write is uploaded.',
    howTo: 'How to turn text into a PDF',
    steps: [
      { title: 'Type on the page', text: 'It opens on a blank A4 page, like Google Docs. Type or paste, or open a .txt or .md file.' },
      { title: 'Format it', text: 'Add headings, bold, lists, colours and pictures. Ctrl+Enter (⌘+Enter on a Mac) starts a new page.' },
      { title: 'Download the PDF', text: 'Tap Done to see every page, then name it and save it.' },
    ],
    faqs: [
      { q: 'Can I convert a .txt file to PDF?', a: 'Yes. Open the file and its text goes straight onto the pages, ready to edit and save as a PDF.' },
      { q: 'How do I start a new page?', a: 'Press Ctrl+Enter, or ⌘+Enter on a Mac, the same as in Word and Google Docs. On a phone, tap the new page button at the top.' },
      {
        q: 'Which languages work?',
        a: 'English and most Western European languages. Emoji and some symbols or alphabets can’t go in the PDF yet, and snappdf tells you before you save.',
      },
      notUploaded('text'),
    ],
  },

    'compress-pdf': {
    title: 'Compress PDF Free: Reduce PDF File Size · snappdf',
    description: 'Shrink a PDF to fit email and upload limits, free. Pick a target size like 1 MB or 2 MB. Everything runs on your device and nothing is uploaded.',
    howTo: 'How to compress a PDF',
    steps: [
      { title: 'Choose a PDF', text: 'Add the PDF you want to make smaller.' },
      { title: 'Pick a size', text: 'Choose a target like 1 MB or 2 MB, or use Light or Strong compression.' },
      { title: 'Download the result', text: 'Check the before and after sizes, then save the new PDF. Your original is always available too.' },
    ],
    faqs: [
      {
        q: 'Will compressing remove the text from my PDF?',
        a: 'Light compression keeps your text selectable but often saves very little. Strong and target size turn each page into an image, so text, links and form fields can no longer be selected.',
      },
      {
        q: 'Can I make a PDF smaller than a specific size?',
        a: 'Yes. Pick 1 MB, 2 MB, 5 MB or your own size, and snappdf lowers the quality step by step until the file fits.',
      },
      notUploaded('PDF'),
    ],
  },
  
  'pdf-to-word': {
    title: 'Free PDF to Word Converter: Editable DOCX · snappdf',
    description: 'Convert a PDF to an editable Word document that looks like the original. Free, no sign-up, and your PDF never leaves your device.',
    howTo: 'How to convert a PDF to Word',
    steps: [
      { title: 'Choose a PDF', text: 'Add the PDF you want to edit in Word.' },
      { title: 'Convert it', text: 'Tap Convert to Word. Every page is rebuilt with the same layout, and every word stays editable.' },
      { title: 'Download the .docx', text: 'Open it in Microsoft Word, Google Docs, Pages or LibreOffice.' },
    ],
    faqs: [
      {
        q: 'Will the Word file look like my PDF?',
        a: 'Yes. Images, colours, lines and shapes stay exactly where they were, and the text sits on top in the same font, size and colour, ready to edit.',
      },
      {
        q: 'Can I convert a scanned PDF?',
        a: 'Yes, but a scanned page is a picture of text, so it goes into Word as a picture you can’t edit. PDFs made from documents convert best.',
      },
      notUploaded('PDF'),
    ],
  },
  'word-to-pdf': {
    title: 'Free Word to PDF Converter: DOCX to PDF · snappdf',
    description: 'Convert a Word document (.docx) to PDF for free and see every page before you download. The text stays selectable, and nothing is uploaded.',
    howTo: 'How to convert Word to PDF',
    steps: [
      { title: 'Choose your document', text: 'Add a Word document that ends in .docx, from your phone or computer.' },
      { title: 'Check every page', text: 'It’s turned into PDF pages straight away. Scroll through them, and tap any page to see it full size.' },
      { title: 'Download the PDF', text: 'Name it and save it. The text stays real text and links still work.' },
    ],
    faqs: [
      {
        q: 'Will the PDF look like my Word document?',
        a: 'Very close. Word’s common fonts like Calibri, Cambria, Arial and Times New Roman are swapped for free fonts with the same letter widths, so lines and pages break where they do in Word. The preview shows exactly what you’ll download.',
      },
      {
        q: 'Can I convert an old .doc file?',
        a: 'Not yet. Open it in Word or Google Docs, save it as .docx, then convert it here.',
      },
      {
        q: 'Can I still select and copy the text?',
        a: 'Yes. The text stays real text, so you can select it, search it, and job sites can read your CV.',
      },
      notUploaded('document'),
    ],
  },
  'csv-to-excel': {
    title: 'CSV to Excel Converter: CSV to XLSX, Free · snappdf',
    description: 'Convert a CSV file to an Excel spreadsheet (.xlsx) in seconds. Free, private and works offline, your data never leaves your device.',
    howTo: 'How to convert CSV to Excel',
    steps: [
      { title: 'Choose a CSV file', text: 'Add the .csv file you want to open in Excel.' },
      { title: 'Convert it', text: 'Tap Convert to Excel and every row and column goes into a spreadsheet.' },
      { title: 'Download the .xlsx', text: 'Open it in Excel, Google Sheets, Numbers or LibreOffice.' },
    ],
    faqs: [
      {
        q: 'Why turn a CSV into an Excel file?',
        a: 'A CSV is plain text. As an .xlsx file it opens straight into rows and columns, and you can add formatting, formulas and more sheets.',
      },
      notUploaded('data'),
    ],
  },
  'json-to-excel': {
    title: 'JSON to Excel Converter: JSON to XLSX, Free · snappdf',
    description: 'Turn a JSON file into an Excel spreadsheet (.xlsx), one row per item and one column per field. Free, private, and nothing is uploaded.',
    howTo: 'How to convert JSON to Excel',
    steps: [
      { title: 'Choose a JSON file', text: 'Add the .json file you want as a spreadsheet.' },
      { title: 'Convert it', text: 'Tap Convert to Excel. Each item becomes a row and each field a column.' },
      { title: 'Download the .xlsx', text: 'Open it in Excel, Google Sheets, Numbers or LibreOffice.' },
    ],
    faqs: [
      {
        q: 'What should my JSON look like?',
        a: 'A list of objects works best, like [{"name": "Ada", "year": 1843}]. Each object becomes a row and each field a column. A single object becomes one row.',
      },
      notUploaded('data'),
    ],
  },
  'json-to-csv': {
    title: 'JSON to CSV Converter, Free and Private · snappdf',
    description: 'Convert a JSON file to CSV, one row per item and one column per field. Free, private and works offline, your data never leaves your device.',
    howTo: 'How to convert JSON to CSV',
    steps: [
      { title: 'Choose a JSON file', text: 'Add the .json file you want as a CSV.' },
      { title: 'Convert it', text: 'Tap Convert to CSV. Each item becomes a row and each field a column.' },
      { title: 'Download the .csv', text: 'Open it in any spreadsheet app, or load it into another tool.' },
    ],
    faqs: [
      {
        q: 'What should my JSON look like?',
        a: 'A list of objects works best, like [{"name": "Ada", "year": 1843}]. Each object becomes a row and each field a column. A single object becomes one row.',
      },
      notUploaded('data'),
    ],
  },
};

const LANDING: PageMeta = {
  path: '/',
  title: 'Free PDF Tools: Merge, Split, Sign & Convert PDFs · snappdf',
  description:
    'Free PDF tools that run in your browser. Image to PDF, merge, split and sign PDFs, PDF to Word and more. No uploads, no watermarks, no sign-up.',
  heading: 'Free PDF tools that never upload your files',
};

const ALL_TOOLS: PageMeta = {
  path: '/app',
  title: 'All Free PDF Tools · snappdf',
  description:
    'Every snappdf tool in one place: image to PDF, merge, split and sign PDFs, PDF to Word, text to PDF, and CSV or JSON to Excel. Free, and nothing is uploaded.',
  heading: 'All PDF tools',
};

const PRIVACY: PageMeta = {
  path: '/privacy',
  title: 'Privacy policy · snappdf',
  description: 'snappdf processes your files on your own device and never uploads them. Here’s what we collect, what we don’t, and why.',
  heading: 'Privacy policy',
};

const REPORT: PageMeta = {
  path: '/report',
  title: 'Report a bug or request a feature · snappdf',
  description: 'Found a bug in snappdf, or want a new PDF tool? Tell us here. No account needed.',
  heading: 'Report a bug or request a feature',
};

export const NOT_FOUND: PageMeta = {
  path: '/404',
  title: 'Page not found · snappdf',
  description: 'This page doesn’t exist. Try one of the free PDF tools instead.',
  heading: 'Page not found',
  noindex: true,
};

function toolPage(id: ToolId): PageMeta {
  const { title, description } = TOOL_GUIDES[id];
  return { path: `/app/${id}`, title, description, heading: TOOLS.find((t) => t.id === id)!.name, tool: id };
}

// every page that should be in search results, in the order of the sitemap
export const PAGES: PageMeta[] = [LANDING, ALL_TOOLS, ...TOOLS.map((t) => toolPage(t.id)), PRIVACY, REPORT];

export function pageFor(route: Route): PageMeta {
  switch (route.name) {
    case 'landing':
      return LANDING;
    case 'tools':
      return ALL_TOOLS;
    case 'tool':
      return toolPage(route.tool);
    case 'privacy':
      return PRIVACY;
    case 'report':
      return REPORT;
    case 'not-found':
      return NOT_FOUND;
  }
}

const app = (name: string, url: string, description: string) => ({
  '@type': 'WebApplication',
  name,
  url,
  description,
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Any',
  browserRequirements: 'Requires JavaScript and a modern browser',
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  image: OG_IMAGE,
  author: { '@type': 'Person', ...AUTHOR },
});

const breadcrumbs = (trail: PageMeta[]) => ({
  '@type': 'BreadcrumbList',
  itemListElement: trail.map((page, i) => ({ '@type': 'ListItem', position: i + 1, name: page.heading, item: SITE_URL + page.path })),
});

// schema.org data google reads to understand the page, written into the html as json-ld
export function structuredData(page: PageMeta) {
  const url = SITE_URL + page.path;
  let graph: object[];
  if (page.tool) {
    graph = [
      app(`${page.heading} by snappdf`, url, page.description),
      breadcrumbs([{ ...LANDING, heading: 'snappdf' }, ALL_TOOLS, page]),
      {
        '@type': 'FAQPage',
        mainEntity: TOOL_GUIDES[page.tool].faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      },
    ];
  } else if (page === LANDING) {
    graph = [
      { '@type': 'WebSite', name: 'snappdf', url, description: page.description, inLanguage: 'en' },
      { ...app('snappdf', url, page.description), featureList: TOOLS.map((t) => t.name) },
    ];
  } else if (page === ALL_TOOLS) {
    graph = [
      breadcrumbs([{ ...LANDING, heading: 'snappdf' }, ALL_TOOLS]),
      {
        '@type': 'ItemList',
        itemListElement: TOOLS.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.name, url: `${SITE_URL}/app/${t.id}` })),
      },
    ];
  } else {
    return null;
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}
