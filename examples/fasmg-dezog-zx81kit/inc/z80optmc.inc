macro jrp op1*,op2
; if possible -> jr (one byte less)
; else -> jp
; also for conditionals, eg:
;   jrp address
;   jrp condition,address
  match cnd adr , op1 op2
    if adr-$ <= 127 & adr-$ >=-128
        jr cnd,adr
    else
        jp cnd,adr
    end if
  else match adr , op1
    if adr-$ <= 127 & adr-$ >=-128
        jr adr
    else
        jp adr
    end if
  end match
end macro
