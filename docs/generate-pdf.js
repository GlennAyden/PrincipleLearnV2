const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function generatePDF() {
    console.log('📄 Generating PrincipleLearn V3 Documentation PDF...');

    // Read HTML content
    const htmlPath = path.join(__dirname, 'pdf-content.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    const outputPath = path.join(__dirname, 'PrincipleLearn_V3_Documentation.pdf');

    await page.pdf({
        path: outputPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', bottom: '25mm', left: '20mm', right: '20mm' },
        displayHeaderFooter: true,
        headerTemplate: `
      <div style="font-size:8px; color:#666; width:100%; text-align:center; padding:5px 20mm;">
        <span>PrincipleLearn V3 — Dokumentasi Media Pembelajaran</span>
      </div>`,
        footerTemplate: `
      <div style="font-size:8px; color:#666; width:100%; text-align:center; padding:5px 20mm;">
        <span class="pageNumber"></span> / <span class="totalPages"></span>
      </div>`
    });

    await browser.close();

    const stats = fs.statSync(outputPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`✅ PDF generated: ${outputPath} (${sizeMB} MB)`);
}

generatePDF().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
