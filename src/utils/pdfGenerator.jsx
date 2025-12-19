// ================================
// FILE: src/utils/pdfGenerator.js
// MODIFIKASI:
// 1. Header Tabel: Background Putih.
// 2. Summary: Jarak vertikal diperkecil (Line Height: 4.5).
// 3. Font Size: Tetap 8pt.
// ================================

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- KONSTANTA ---
const companyInfo = {
    nama: "CV. GANGSAR MULIA UTAMA",
};

const baseURL = 'https://gudanggalatama.web.app-'; 

// --- HELPER ---
const formatNumber = (value) =>
    new Intl.NumberFormat('id-ID', {
        minimumFractionDigits: 0,
    }).format(value || 0);

const formatDate = (timestamp) =>
    new Date(timestamp || 0).toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
    });

/**
 * Fungsi Pembangun Dokumen PDF (Khusus Nota)
 */
const buildNotaDoc = (transaksi) => {
    
    // --- 1. PENGATURAN KERTAS (A5 Landscape) ---
    const doc = new jsPDF('landscape', 'mm', 'a5'); 
    const margin = { top: 15, right: 15, bottom: 20, left: 15 };

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let currentY = margin.top;

    const title = 'NOTA PEMBAYARAN';
    const linkId = (transaksi.nomorInvoice || transaksi.id || '').replace(/^INV-/i, 'NT-'); 
    const link = `${baseURL}/nota/${linkId}`;

    // --- 2. HEADER ---
    doc.setFontSize(16); 
    doc.setFont('helvetica', 'bold');
    doc.text(companyInfo.nama, margin.left, currentY);
    
    doc.setFontSize(10); 
    doc.text(title, pageWidth - margin.right, currentY, { align: 'right' });
    
    currentY += 2; 

    doc.setLineWidth(0.3);
    doc.setDrawColor(0, 0, 0);
    doc.line(margin.left, currentY, pageWidth - margin.right, currentY);
    currentY += 6; 

    // --- 3. INFO PELANGGAN & TRANSAKSI ---
    const infoRightColX = pageWidth / 2 + 10;
    const infoRightColValueX = infoRightColX + 25;
    
    // Kiri: Info Pelanggan
    doc.setFontSize(9); 
    doc.setFont('helvetica', 'bold');
    doc.text('Kepada Yth:', margin.left, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(transaksi.namaPelanggan || 'Pelanggan Umum', margin.left, currentY + 5);
    
    // Kanan: Info Nota
    doc.setFont('helvetica', 'bold');
    doc.text('No. Nota:', infoRightColX, currentY);
    
    let displayNomor = transaksi.nomorInvoice || '-';
    displayNomor = displayNomor.replace(/^INV-/i, 'NT-').replace('INV-', 'NT-');

    doc.setFont('helvetica', 'normal');
    doc.text(displayNomor, infoRightColValueX, currentY);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Tanggal:', infoRightColX, currentY + 5);
    doc.setFont('helvetica', 'normal');
    doc.text(formatDate(transaksi.tanggal), infoRightColValueX, currentY + 5);
    
    currentY += 12; 

    // --- 4. TABEL ITEM ---
    const head = [['No', 'Pekerjaan', 'Merek', 'Ukuran', 'Qty', 'Harga', 'Subtotal']];
    
    let totalQty = 0;
    let subtotalItems = 0; 

    const body = (transaksi.items || []).map((item, i) => {
        const qty = Number(item.jumlah || 0);
        const hargaSatuan = Number(item.hargaJual || 0); 
        const subtotalBaris = qty * hargaSatuan;

        totalQty += qty;
        subtotalItems += subtotalBaris;

        let merek = '-';
        let ukuran = item.namaPlate || '-';
        const matchMerek = item.namaPlate?.match(/\(([^)]+)\)/);
        if (matchMerek) {
            merek = matchMerek[1];
            ukuran = item.namaPlate?.split('(')[0]?.trim(); 
        }

        return [
            i + 1, 
            item.pekerjaan || '-',     
            merek,                     
            ukuran,                    
            qty, 
            formatNumber(hargaSatuan), 
            formatNumber(subtotalBaris)
        ];
    });

    autoTable(doc, {
        head,
        body,
        startY: currentY,
        theme: 'grid',
        headStyles: {
            fillColor: [255, 255, 255], // Putih
            textColor: [0, 0, 0],
            lineColor: [0, 0, 0],
            lineWidth: 0.1,
            halign: 'center',
            fontSize: 8,
            fontStyle: 'bold',
            cellPadding: 1.5,
        },
        styles: {
            lineColor: [0, 0, 0],
            lineWidth: 0.1,
            fontSize: 8, 
            cellPadding: 1.5,
            valign: 'middle',
            textColor: [0, 0, 0]
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 8 },  
            1: { cellWidth: 40 },                   
            2: { cellWidth: 25 },                   
            3: { cellWidth: 25 },                   
            4: { halign: 'center', cellWidth: 10 }, 
            5: { halign: 'right', cellWidth: 30 },  
            6: { halign: 'right', cellWidth: 'auto' } 
        },
        margin: { left: margin.left, right: margin.right },
    });

    currentY = doc.lastAutoTable.finalY || currentY;
    currentY += 5; 
    
    const checkPageOverflow = (y, increment = 5) => { 
        if (y + increment > pageHeight - margin.bottom) {
             doc.addPage();
             return margin.top;
        }
        return y + increment;
    };
    
    currentY = checkPageOverflow(currentY, 0);

    // --- 5. SUMMARY & TOTAL ---
    const diskonLain = Number(transaksi.diskonLain || 0);
    const biayaTentu = Number(transaksi.biayaTentu || 0);
    const totalTagihanFinal = Number(transaksi.totalTagihan || 0); 
    const jumlahTerbayar = Number(transaksi.jumlahTerbayar || 0);
    const sisaTagihan = totalTagihanFinal - jumlahTerbayar;

    const totalColValueX = pageWidth - margin.right; 
    const totalColLabelX = totalColValueX - 40; 
    
    let summaryY = currentY;

    // --- KIRI: Total Qty ---
    doc.setFontSize(8); 
    doc.setFont('helvetica', 'bold');
    doc.text('Total Qty:', margin.left, summaryY);
    doc.setFont('helvetica', 'normal');
    doc.text(String(totalQty), margin.left + 20, summaryY);

    // --- KANAN: Rincian Angka ---
    doc.setFontSize(8); 
    const lineHeight = 4.5; // <--- MODIFIKASI: Diperkecil menjadi 4.5 (sebelumnya 6)
    
    // 1. Total Barang
    doc.setFont('helvetica', 'normal'); 
    doc.text('Total Barang:', totalColLabelX, summaryY); 
    doc.text(formatNumber(subtotalItems), totalColValueX, summaryY, { align: 'right' }); 
    summaryY = checkPageOverflow(summaryY, lineHeight);

    // 2. Potongan Lain
    if (diskonLain > 0) {
        doc.text('Potongan Lain:', totalColLabelX, summaryY); 
        doc.text(`(${formatNumber(diskonLain)})`, totalColValueX, summaryY, { align: 'right' }); 
        summaryY = checkPageOverflow(summaryY, lineHeight);
    }
    
    // 3. Biaya Tambahan
    if (biayaTentu > 0) {
        doc.text('Biaya Tambahan:', totalColLabelX, summaryY);
        doc.text(formatNumber(biayaTentu), totalColValueX, summaryY, { align: 'right' }); 
        summaryY = checkPageOverflow(summaryY, lineHeight);
    }

    // Garis pemisah total
    // doc.setLineWidth(0.1);
    // doc.line(totalColLabelX - 2, summaryY - (lineHeight/2), pageWidth - margin.right, summaryY - (lineHeight/2));

    // 4. Total Tagihan
    doc.setFont('helvetica', 'bold');
    doc.text('Total Tagihan:', totalColLabelX, summaryY);
    doc.text(formatNumber(totalTagihanFinal), totalColValueX, summaryY, { align: 'right' }); 
    summaryY = checkPageOverflow(summaryY, lineHeight);

    // 5. Terbayar
    doc.setFont('helvetica', 'normal');
    doc.text('Terbayar:', totalColLabelX, summaryY);
    doc.text(formatNumber(jumlahTerbayar), totalColValueX, summaryY, { align: 'right' }); 
    summaryY = checkPageOverflow(summaryY, lineHeight);
    
    // 6. Sisa
    doc.setFont('helvetica', 'bold');
    doc.text('Sisa Tagihan:', totalColLabelX, summaryY);
    doc.text(formatNumber(sisaTagihan), totalColValueX, summaryY, { align: 'right' }); 

    return doc;
};

export const generateNotaPDF = (transaksi) =>
    buildNotaDoc(transaksi).output('datauristring');

export const generateInvoicePDF = () => {};