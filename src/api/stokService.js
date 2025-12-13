import { ref, runTransaction, push, set, serverTimestamp } from 'firebase/database';
import { db } from './firebase'; 
import dayjs from 'dayjs';

export const updatePlateStock = async ({ plateId, quantity, keterangan, tanggal, metadata = {} }) => {
    if (!plateId) throw new Error("Plate ID diperlukan");
    if (quantity === 0) throw new Error("Jumlah tidak boleh 0");

    const plateRef = ref(db, `plate/${plateId}`);
    const txDate = tanggal || dayjs().format('YYYY-MM-DD');

    // 1. Transaction update stok master
    const result = await runTransaction(plateRef, (currentData) => {
        if (!currentData) return;
        const stokLama = Number(currentData.stok) || 0;
        return {
            ...currentData,
            stok: stokLama + quantity,
            updatedAt: serverTimestamp(),
        };
    });

    // 2. Simpan History
    if (result.committed && result.snapshot.exists()) {
        const finalData = result.snapshot.val();
        const stokSesudah = finalData.stok;
        const stokSebelum = stokSesudah - quantity;

        const historyData = {
            plateId: plateId,
            kode_plate: metadata.kode_plate || finalData.kode_plate || '-',
            merek_plate: metadata.merek_plate || finalData.merek_plate || '-',
            ukuran_plate: metadata.ukuran_plate || finalData.ukuran_plate || '-',
            perubahan: quantity,
            stokSebelum,
            stokSesudah,
            keterangan: keterangan || (quantity > 0 ? 'Stok Masuk' : 'Stok Keluar'),
            tanggal: txDate,
            timestamp: serverTimestamp()
        };

        const newHistoryRef = push(ref(db, 'historiStok'));
        await set(newHistoryRef, historyData);
        return true;
    } else {
        throw new Error(`Gagal update stok untuk ID: ${plateId}`);
    }
};