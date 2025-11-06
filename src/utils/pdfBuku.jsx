// src/utils/pdfGenerator.js
import { numberFormatter, currencyFormatter } from './formatters'; // <-- percentFormatter dihapus

// --- MODIFIKASI IMPORT ---
import jsPDF from 'jspdf';
// Hapus: import 'jspdf-autotable'; 
import autoTable from 'jspdf-autotable'; // Import fungsi autoTable secara langsung
// --- AKHIR MODIFIKASI ---

export const generateBukuPdfBlob = (dataToExport, headerInfo = {}) => {
    const {
        cvName = "CV. GANGSAR MULIA UTAMA",
        address = "Jl. Kalicari Dalam I No.4, Kalicari, Kec. Pedurungan, Kota Semarang, Jawa Tengah 50198",
        phone = "0882-0069-05391" 
    } = headerInfo;

    const doc = new jsPDF('vertical');
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    let finalY = 0;

    // --- HEADER PDF ---
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(cvName, pageWidth / 2, 15, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(address, pageWidth / 2, 21, { align: 'center' });
    doc.text(`Telp: ${phone}`, pageWidth / 2, 26, { align: 'center' }); 
    doc.setLineWidth(0.3);
    doc.line(14, 29, pageWidth - 14, 29); 
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Daftar Stok Plate', pageWidth / 2, 36, { align: 'center' }); // <-- Judul sudah benar
    // --- AKHIR HEADER ---
    
    // --- MODIFIKASI BESAR: KOLOM & DATA TABEL ---
    // Kolom disesuaikan dengan data Plate
    const tableColumn = [
        "No.", 
        "Kode Plate", 
        "Ukuran Plate", 
        "Merek Plate", 
        "     Stok", // Padding untuk perataan kanan
        "         Harga Plate" // Padding untuk perataan kanan
    ];
    
    // Data mapping disesuaikan dengan data Plate
    const tableRows = dataToExport.map((plate, index) => [
        index + 1, 
        plate.kode_plate || '-',
        plate.ukuran_plate || '-',
        plate.merek_plate || '-', // <-- Menggunakan merek_plate
        numberFormatter(plate.stok),
        currencyFormatter(plate.harga_plate) // <-- Menggunakan harga_plate
        // <-- Kolom plate lainnya dihapus
    ]);
    // --- AKHIR MODIFIKASI KOLOM & DATA ---

    // --- PENGATURAN TABEL autoTable (MODIFIED) ---
    autoTable(doc, { 
        head: [tableColumn],
        body: tableRows,
        startY: 42, 
        theme: 'grid', 
        headStyles: { 
            fillColor: [230, 230, 230], 
            textColor: 30, 
            fontStyle: 'bold', 
            // halign: 'left', // Dihapus untuk style per kolom
            fontSize: 8, // Sedikit diperbesar agar mudah dibaca
            cellPadding: 1 
        },
        bodyStyles: { 
            fontSize: 7, // Sedikit diperbesar agar mudah dibaca
            cellPadding: 1 
        },
        alternateRowStyles: {
            fillColor: [245, 245, 245] 
        },
        // --- MODIFIKASI BESAR: Style Kolom disesuaikan (6 kolom) ---
        columnStyles: { 
            0: { cellWidth: 7, halign: 'left' },   // No.
            1: { cellWidth: "auto", halign: 'left'},  // Kode Plate
            2: { cellWidth: "auto", halign: 'left'},  // Ukuran Plate
            3: { cellWidth: "auto", halign: 'left'},  // Merek Plate
            4: { cellWidth: 15, halign: 'right' }, // Stok
            5: { cellWidth: 25, halign: 'right' }  // Harga Plate
        },
        // --- HAPUS: willDrawCell tidak diperlukan lagi ---
        // willDrawCell: function (data) { ... },
        
        didDrawPage: function (data) {
             try {
                // @ts-ignore 
                finalY = data.cursor.y; 
             } catch(e){
                console.warn("Tidak bisa mendapatkan cursor.y dari didDrawPage");
                // @ts-ignore 
                finalY = doc.lastAutoTable?.finalY || 50; 
             }
        }
    });
    // --- AKHIR PENGATURAN TABEL ---

    // --- FOOTER PDF (Tidak berubah) ---
    const pageCount = doc.internal.getNumberOfPages ? doc.internal.getNumberOfPages() : 1; 
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i); 
        const printDate = `Dicetak: ${new Date().toLocaleString('id-ID')}`;
        const pageNumText = `Halaman ${i} dari ${pageCount}`;
        doc.text(printDate, 14, pageHeight - 10);
        doc.text(pageNumText, pageWidth - 14 - doc.getTextWidth(pageNumText), pageHeight - 10);
    }
    // --- AKHIR FOOTER ---

    return doc.output('blob'); 
};