import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const companyInfo = {
    nama: "CV. GANGSAR MULIA UTAMA",
};

const formatNumber = (value) =>
    new Intl.NumberFormat('id-ID', {
        minimumFractionDigits: 0,
    }).format(value || 0);

const formatDate = (timestamp) => {
    const date = timestamp?.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    return isNaN(date.getTime()) ? '-' : date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
    });
};

const buildNotaDoc = (transaksi = {}) => {
    const doc = new jsPDF('landscape', 'mm', 'a5'); 
    const margin = { top: 12, right: 12, bottom: 12, left: 12 };
    const pageWidth = doc.internal.pageSize.getWidth();
    const rightEdge = pageWidth - margin.right;
    
    let currentY = margin.top;

    // --- 1. HEADER PERUSAHAAN ---
    doc.setFontSize(14); 
    doc.setFont('helvetica', 'bold');
    doc.text(companyInfo.nama, margin.left, currentY);
    
    doc.setFontSize(10); 
    doc.text('NOTA PEMBAYARAN', rightEdge, currentY, { align: 'right' });
    
    currentY += 2; 
    doc.setLineWidth(0.3);
    doc.line(margin.left, currentY, rightEdge, currentY);
    currentY += 7; 

    // --- 2. INFO PELANGGAN ---
    doc.setFontSize(9); 
    doc.setFont('helvetica', 'bold');
    doc.text('Kepada Yth:', margin.left, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(transaksi.namaPelanggan || 'Pelanggan Umum', margin.left, currentY + 5);
    
    const displayNomor = (transaksi.nomorInvoice || '-').replace(/^INV-/i, 'NT-');
    doc.setFont('helvetica', 'bold');
    doc.text('No. Nota:', rightEdge - 45, currentY, { align: 'left' }); 
    doc.setFont('helvetica', 'normal');
    doc.text(displayNomor, rightEdge, currentY, { align: 'right' }); 

    doc.setFont('helvetica', 'bold');
    doc.text('Tanggal:', rightEdge - 45, currentY + 5, { align: 'left' });
    doc.setFont('helvetica', 'normal');
    doc.text(formatDate(transaksi.tanggal), rightEdge, currentY + 5, { align: 'right' });
    
    currentY += 12; 

    // --- 3. TABEL (TANPA BACKGROUND HEADER) ---
    const tableBody = (transaksi.items || []).map((item, i) => [
        i + 1, 
        item.pekerjaan || '-', 
        item.namaPlate || '-', 
        item.jumlah || 0, 
        formatNumber(item.hargaJual), 
        formatNumber((item.jumlah || 0) * (item.hargaJual || 0))
    ]);

    autoTable(doc, {
        head: [['No', 'Pekerjaan', 'Ukuran', 'Qty', 'Harga', 'Subtotal']],
        body: tableBody,
        startY: currentY,
        theme: 'grid', // Tetap pakai grid untuk garis pembatas
        headStyles: { 
            fillColor: false, // Menghapus background color
            textColor: [0, 0, 0], 
            fontStyle: 'bold', 
            halign: 'center',
            lineWidth: 0.1 
        },
        styles: { 
            fontSize: 8.5, 
            cellPadding: 2,
            lineColor: [0, 0, 0] // Garis hitam tipis
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 10 },
            2: { halign: 'center', cellWidth: 60 },
            3: { halign: 'center', cellWidth: 10 },
            4: { halign: 'right', cellWidth: 20 },
            5: { halign: 'right', cellWidth: 20 }
        },
    });

    // --- 4. FOOTER (TTD & TOTAL) ---
    let finalY = doc.lastAutoTable.finalY + 10;

    if (finalY + 30 > doc.internal.pageSize.getHeight()) {
        doc.addPage();
        finalY = 20;
    }

    // Tanda Tangan
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text("Penerima,", margin.left + 10, finalY, { align: 'center' });
    doc.text("Hormat Kami,", (pageWidth / 2) - 10, finalY, { align: 'center' });
    
    doc.setFont('helvetica', 'bold');
    doc.text(`( ${transaksi.namaPelanggan || '............'} )`, margin.left + 10, finalY + 20, { align: 'center' });
    doc.text("(      Admin      )", (pageWidth / 2) - 10, finalY + 20, { align: 'center' });

    // Rincian Pembayaran
    const totalTagihan = Number(transaksi.totalTagihan || 0);
    const terbayar = Number(transaksi.jumlahTerbayar || 0);
    const sisa = totalTagihan - terbayar;
    const labelX = rightEdge - 40;

    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL:', labelX, finalY, { align: 'left' });
    doc.text(formatNumber(totalTagihan), rightEdge, finalY, { align: 'right' });
    
    doc.setFont('helvetica', 'normal');
    doc.text('Terbayar:', labelX, finalY + 6, { align: 'left' });
    doc.text(formatNumber(terbayar), rightEdge, finalY + 6, { align: 'right' });

    doc.setLineWidth(0.2);
    doc.line(labelX, finalY + 8, rightEdge, finalY + 8);

    doc.setFont('helvetica', 'bold');
    doc.text('SISA:', labelX, finalY + 12, { align: 'left' });
    doc.text(formatNumber(sisa), rightEdge, finalY + 12, { align: 'right' });

    return doc;
};

export const generateNotaPDF = (transaksi) => {
    try {
        return buildNotaDoc(transaksi).output('datauristring');
    } catch (error) {
        console.error("PDF Error:", error);
        return "";
    }
};
export const generateInvoicePDF = (transaksi) => {
    try {
        return buildNotaDoc(transaksi).output('datauristring');
    } catch (error) {
        console.error("PDF Error:", error);
        return "";
    }
};