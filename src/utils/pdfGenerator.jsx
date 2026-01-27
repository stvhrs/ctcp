// ================================
// FILE: src/utils/pdfGenerator.js
// ================================

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- KONSTANTA ---
const companyInfo = {
    nama: "CV. GANGSAR MULIA UTAMA",
};

const baseURL = 'https://gudanggalatama.web.app'; 

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
    const margin = { top: 15, right: 15, bottom: 15, left: 15 };

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Titik referensi paling kanan (agar layout rapi rata kanan)
    const rightEdge = pageWidth - margin.right;
    
    let currentY = margin.top;

    const title = 'NOTA PEMBAYARAN';

    // --- 2. HEADER ---
    doc.setFontSize(16); 
    doc.setFont('helvetica', 'bold');
    // Kiri: Nama Perusahaan
    doc.text(companyInfo.nama, margin.left, currentY);
    
    // Kanan: Judul Nota
    doc.setFontSize(10); 
    doc.text(title, rightEdge, currentY, { align: 'right' });
    
    currentY += 2; 

    // Garis Header
    doc.setLineWidth(0.3);
    doc.setDrawColor(0, 0, 0);
    doc.line(margin.left, currentY, rightEdge, currentY);
    currentY += 6; 

    // --- 3. INFO PELANGGAN & TRANSAKSI ---
    // Variabel posisi untuk kolom kanan (No Nota & Tanggal)
    // Kita gunakan rightEdge sebagai patokan agar mentok kanan
    
    // -- KIRI: Info Pelanggan --
    doc.setFontSize(9); 
    doc.setFont('helvetica', 'bold');
    doc.text('Kepada Yth:', margin.left, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(transaksi.namaPelanggan || 'Pelanggan Umum', margin.left, currentY + 5);
    
    // -- KANAN: Info Nota (Space Between) --
    let displayNomor = transaksi.nomorInvoice || '-';
    displayNomor = displayNomor.replace(/^INV-/i, 'NT-').replace('INV-', 'NT-');

    // Baris 1: No. Nota
    doc.setFont('helvetica', 'bold');
    doc.text('No. Nota:', rightEdge - 40, currentY, { align: 'left' }); // Label
    doc.setFont('helvetica', 'normal');
    doc.text(displayNomor, rightEdge, currentY, { align: 'right' });   // Value

    // Baris 2: Tanggal
    doc.setFont('helvetica', 'bold');
    doc.text('Tanggal:', rightEdge - 40, currentY + 5, { align: 'left' });
    doc.setFont('helvetica', 'normal');
    doc.text(formatDate(transaksi.tanggal), rightEdge, currentY + 5, { align: 'right' });
    
    currentY += 12; 

    // --- 4. TABEL ITEM ---
    const head = [['No', 'Pekerjaan', 'Ukuran', 'Qty', 'Harga', 'Subtotal']];
    
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
        
        // Logika parsing ukuran jika ada format "Ukuran (Merek)"
        const matchMerek = item.namaPlate?.match(/\(([^)]+)\)/);
        if (matchMerek) {
            merek = matchMerek[1];
            ukuran = item.namaPlate?.split('(')[0]?.trim(); 
        }

        return [
            i + 1, 
            item.pekerjaan || '-',     
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
        theme: 'grid', // Menggunakan garis
        headStyles: {
            fillColor: [255, 255, 255], // Background Header Putih
            textColor: [0, 0, 0],       // Teks Hitam
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
            0: { halign: 'center', cellWidth: 10 }, // No
            1: { halign: 'left', cellWidth: 'auto' }, // Pekerjaan (Fleksibel)
            2: { halign: 'center', cellWidth: 25 }, // Ukuran
            3: { halign: 'center', cellWidth: 15 }, // Qty
            4: { halign: 'right', cellWidth: 25 },  // Harga
            5: { halign: 'right', cellWidth: 30 }   // Subtotal
        },
        margin: { left: margin.left, right: margin.right },
    });

    currentY = doc.lastAutoTable.finalY || currentY;
    currentY += 5; 
    
    // Fungsi cek halaman baru sederhana
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

    // Posisi Label Total (digeser 40mm dari kanan)
    const totalColValueX = rightEdge; 
    const totalColLabelX = rightEdge - 40; 
    
    let summaryY = currentY;

    // --- KIRI: Total Qty ---
    doc.setFontSize(8); 
    doc.setFont('helvetica', 'bold');
    doc.text('Total Qty:', margin.left, summaryY);
    doc.setFont('helvetica', 'normal');
    doc.text(String(totalQty), margin.left + 20, summaryY);

    // --- KANAN: Rincian Angka ---
    doc.setFontSize(8); 
    const lineHeight = 4.5; // Jarak vertikal diperkecil
    
    // 1. Total Barang
    doc.setFont('helvetica', 'normal'); 
    doc.text('Total Barang:', totalColLabelX, summaryY, { align: 'left' }); 
    doc.text(formatNumber(subtotalItems), totalColValueX, summaryY, { align: 'right' }); 
    summaryY = checkPageOverflow(summaryY, lineHeight);

    // 2. Potongan Lain
    if (diskonLain > 0) {
        doc.text('Potongan Lain:', totalColLabelX, summaryY, { align: 'left' }); 
        doc.text(`(${formatNumber(diskonLain)})`, totalColValueX, summaryY, { align: 'right' }); 
        summaryY = checkPageOverflow(summaryY, lineHeight);
    }
    
    // 3. Biaya Tambahan
    if (biayaTentu > 0) {
        doc.text('Biaya Tambahan:', totalColLabelX, summaryY, { align: 'left' });
        doc.text(formatNumber(biayaTentu), totalColValueX, summaryY, { align: 'right' }); 
        summaryY = checkPageOverflow(summaryY, lineHeight);
    }

    // 4. Total Tagihan
    doc.setFont('helvetica', 'bold');
    doc.text('Total Tagihan:', totalColLabelX, summaryY, { align: 'left' });
    doc.text(formatNumber(totalTagihanFinal), totalColValueX, summaryY, { align: 'right' }); 
    summaryY = checkPageOverflow(summaryY, lineHeight);

    // 5. Terbayar
    doc.setFont('helvetica', 'normal');
    doc.text('Terbayar:', totalColLabelX, summaryY, { align: 'left' });
    doc.text(formatNumber(jumlahTerbayar), totalColValueX, summaryY, { align: 'right' }); 
    summaryY = checkPageOverflow(summaryY, lineHeight);
    
    // 6. Sisa
    doc.setFont('helvetica', 'bold');
    doc.text('Sisa Tagihan:', totalColLabelX, summaryY, { align: 'left' });
    doc.text(formatNumber(sisaTagihan), totalColValueX, summaryY, { align: 'right' }); 
    
    currentY = summaryY + 8; // Beri jarak setelah total sebelum Tanda Tangan

    // --- 6. TANDA TANGAN ---
    // Cek apakah cukup ruang untuk tanda tangan (butuh sekitar 30mm)
    if (currentY + 30 > pageHeight - margin.bottom) {
        doc.addPage();
        currentY = margin.top + 10;
    }

    const signY = currentY + 5;
    const nameY = signY + 18; // Jarak untuk tanda tangan

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    // -- Kiri: Pelanggan --
    // Posisi X sekitar margin kiri + sedikit offset agar center
    const leftSignX = margin.left + 20; 
    
    doc.text("Penerima,", leftSignX, signY, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(`( ${transaksi.namaPelanggan || '...................'} )`, leftSignX, nameY, { align: 'center' });

    // -- Kanan: Admin --
    // Posisi X sekitar rightEdge - sedikit offset agar center
    const rightSignX = rightEdge - 20; 

    doc.setFont('helvetica', 'normal');
    doc.text("Hormat Kami,", rightSignX, signY, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text("( Admin )", rightSignX, nameY, { align: 'center' });

    return doc;
};

export const generateNotaPDF = (transaksi) =>
    buildNotaDoc(transaksi).output('datauristring');
export const generateInvoicePDF = () => {};
