// src/utils/pdfGenerator.js
import { numberFormatter, currencyFormatter } from './formatters';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const generateBukuPdfBlob = (dataToExport, headerInfo = {}) => {
    const {
        cvName = "CV. GANGSAR MULIA UTAMA",
        address = "Jl. Kalicari Dalam I No.4, Kalicari, Kec. Pedurungan, Kota Semarang, Jawa Tengah 50198",
        phone = "0882-0069-05391" 
    } = headerInfo;

    // --- 1. HITUNG TOTAL ASET (STOK x HARGA BELI) ---
    const totalAset = dataToExport.reduce((sum, item) => {
        const stok = Number(item.stok) || 0;
        const harga = Number(item.harga_plate) || 0;
        return sum + (stok * harga);
    }, 0);

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
    doc.text('Daftar Stok & Aset Plate', pageWidth / 2, 36, { align: 'center' });
    // --- AKHIR HEADER ---
    
    // --- KOLOM & DATA TABEL ---
    const tableColumn = [
        "No.", 
        // "Kode Plate", // (Opsional: Hapus jika memang tidak dipakai lagi)
        "Ukuran Plate", 
        "Merek Plate", 
        "    Stok", 
        "        Harga Beli" 
    ];
    
    const tableRows = dataToExport.map((plate, index) => [
        index + 1, 
        // plate.kode_plate || '-', // (Opsional: Hapus jika kolom dihapus)
        plate.ukuran_plate || '-',
        plate.merek_plate || '-', 
        numberFormatter(plate.stok),
        currencyFormatter(plate.harga_plate) 
    ]);

    // --- PENGATURAN TABEL autoTable ---
    autoTable(doc, { 
        head: [tableColumn],
        body: tableRows,
        startY: 42, 
        theme: 'grid', 
        headStyles: { 
            fillColor: [230, 230, 230], 
            textColor: 30, 
            fontStyle: 'bold', 
            fontSize: 8, 
            cellPadding: 1 
        },
        bodyStyles: { 
            fontSize: 7, 
            cellPadding: 1 
        },
        alternateRowStyles: {
            fillColor: [245, 245, 245] 
        },
        columnStyles: { 
            0: { cellWidth: 7, halign: 'left' },   // No.
            // 1: { cellWidth: "auto", halign: 'left'}, // Kode Plate (Sesuaikan index jika dihapus)
            1: { cellWidth: "auto", halign: 'left'},  // Ukuran Plate
            2: { cellWidth: "auto", halign: 'left'},  // Merek Plate
            3: { cellWidth: 15, halign: 'right' }, // Stok
            4: { cellWidth: 25, halign: 'right' }  // Harga Plate
        },
        didDrawPage: function (data) {
             try {
                // @ts-ignore 
                finalY = data.cursor.y; 
             } catch(e){
                console.warn("Tidak bisa mendapatkan cursor.y");
                // @ts-ignore 
                finalY = doc.lastAutoTable?.finalY || 50; 
             }
        }
    });

    // --- 2. TAMPILKAN TOTAL ASET SETELAH TABEL ---
    // Ambil posisi Y terakhir dari tabel
    const lastY = doc.lastAutoTable.finalY + 10; // Beri jarak 10 unit dari tabel

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    
    // Teks Label
    doc.text("Total Aset (Stok x Harga):", pageWidth - 60, lastY, { align: 'right' });
    
    // Teks Nominal
    doc.text(currencyFormatter(totalAset), pageWidth - 14, lastY, { align: 'right' });

    // --- FOOTER PDF ---
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

    return doc.output('blob'); 
};