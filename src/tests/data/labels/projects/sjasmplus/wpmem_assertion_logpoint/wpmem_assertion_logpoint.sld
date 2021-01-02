|SLD.data.version|1
||K|KEYWORDS|WPMEM,LOGPOINT,ASSERTION
main.asm|2||0|-1|-1|Z|pages.size:65536,pages.count:32,slots.count:1,slots.adr:0
main.asm|12||0|0|40960|K|; WPMEM
main.asm|13||0|0|40976|K|; WPMEM, 5, w
main.asm|14||0|0|40992|K|; WPMEM 0x7000, 10,  r
main.asm|15||0|0|40992|K|; This is a watchpoint WPMEM 0x6000, 5,  w, A == 0
main.asm|16||0|0|40992|K|; WPMEMx 0x9000, 5,  w, A == 0
main.asm|18||0|0|40992|K|; Should now also work: no address and no used bytes: WPMEM
main.asm|21||8|0|41024|K|; WPMEM
main.asm|22||8|0|41025|K|; WPMEM
main.asm|26||0|0|41216|K|; ASSERTION
main.asm|26||0|0|41216|T|
main.asm|27||0|0|41217|K|; ASSERTION B==1
main.asm|27||0|0|41217|T|
main.asm|28||0|0|41218|K|; ASSERTIONx
main.asm|28||0|0|41218|T|
main.asm|33||0|0|41472|K|; LOGPOINT [GROUP1] ${A}
main.asm|33||0|0|41472|T|
main.asm|34||0|0|41473|K|; LOGPOINT [GROUP1] BC=${hex:BC}
main.asm|34||0|0|41473|T|
main.asm|35||0|0|41474|K|; LOGPOINT [GROUP1]
main.asm|35||0|0|41474|T|
main.asm|36||0|0|41475|K|; LOGPOINT MY LOG
main.asm|36||0|0|41475|T|
main.asm|37||0|0|41476|K|; LOGPOINTx [GROUP2] ${A}
main.asm|37||0|0|41476|T|
