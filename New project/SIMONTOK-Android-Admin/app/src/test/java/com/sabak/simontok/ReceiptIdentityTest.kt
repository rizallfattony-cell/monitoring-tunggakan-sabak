package com.sabak.simontok

import org.junit.Assert.*
import org.junit.Test
import java.util.Date

class ReceiptIdentityTest {
    private val row=CustomerDebt("ANANG RIDWAN","00143900001","PELANGGAN","R1","1300","ALAMAT",1,"A","1",100000.0)
    @Test fun stableIdentityAndTextWhenPreviewRendersAgain() {
        val identity=ReceiptIdentity(date=Date(1601485200000),transactionId="0000123456",reference="FIXEDREFERENCE")
        val settings=ReceiptSettings("TOKO","ALAMAT",5000.0)
        val first=buildReceiptText(row,null,settings,5000.0,identity.date,identity.transactionId,identity.reference)
        val again=buildReceiptText(row,null,settings,5000.0,identity.date,identity.transactionId,identity.reference)
        assertEquals(first,again)
        assertTrue(first.contains("0000123456"))
        assertTrue(first.contains("FIXEDREFERENCE"))
        assertTrue(first.contains("110.000"))
    }
    @Test fun extraChangesDoNotChangeReferenceOrTime() {
        val date=Date(1601485200000)
        val first=buildReceiptText(row,null,ReceiptSettings("TOKO","ALAMAT",5000.0),0.0,date,"00001","REFERENCE")
        val next=buildReceiptText(row,null,ReceiptSettings("TOKO","ALAMAT",5000.0),5000.0,date,"00001","REFERENCE")
        assertNotEquals(first,next)
        assertEquals(first.substringBefore("Rincian Tagihan"),next.substringBefore("Rincian Tagihan"))
    }
    @Test fun monthUsesWibAndShiftsAcrossYears() {
        assertEquals("2020-10",receiptMonth(Date(1601485200000)))
        assertEquals("2027-01",shiftReceiptMonth("2026-12",1))
        assertEquals("2025-12",shiftReceiptMonth("2026-01",-1))
    }
}
