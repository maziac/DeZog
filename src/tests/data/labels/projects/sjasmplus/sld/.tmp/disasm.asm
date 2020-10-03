L0000:       equ  0000h
L80EB:       equ  80EBh


             org 8000h


8000 L8000:
8000 F3           DI
8001 31 ED 80     LD   SP,L80EB+2
8004 ED 91 55 64  NEXTREG REG_MMU5,64h
8008 CD 00 A0     CALL LA000
800B 00           NOP
800C 00           NOP
800D ED 91 55 65  NEXTREG REG_MMU5,65h
8011 CD 00 A0     CALL LA000
8014 00           NOP
8015 00           NOP
8016 ED 91 55 6E  NEXTREG REG_MMU5,6Eh
801A CD 00 00     CALL L0000


             org A000h


A000 LA000:
A000 00           NOP
A001 00           NOP
A002 00           NOP
A003 00           NOP
A004 00           NOP
A005 00           NOP
A006 00           NOP
A007 00           NOP
A008 00           NOP
A009 00           NOP
A00A 00           NOP
A00B 00           NOP
A00C 00           NOP
A00D 00           NOP
A00E 00           NOP
A00F 00           NOP
A010 00           NOP
A011 00           NOP
A012 00           NOP
A013 00           NOP
A014 00           NOP
A015 00           NOP
A016 00           NOP
A017 00           NOP
A018 00           NOP
A019 00           NOP
A01A 00           NOP
A01B 00           NOP
A01C 00           NOP
A01D 00           NOP
A01E 00           NOP
A01F 00           NOP
A020 00           NOP
A021 00           NOP
A022 00           NOP
A023 00           NOP
A024 00           NOP
A025 00           NOP
A026 00           NOP
A027 00           NOP
A028 00           NOP
A029 00           NOP
A02A 00           NOP
A02B 00           NOP
A02C 00           NOP
A02D 00           NOP
A02E 00           NOP
A02F 00           NOP
A030 00           NOP
A031 00           NOP
A032 00           NOP
A033 00           NOP
A034 00           NOP
A035 00           NOP
A036 00           NOP
A037 00           NOP
A038 00           NOP
A039 00           NOP
A03A 00           NOP
A03B 00           NOP
A03C 00           NOP
A03D 00           NOP
A03E 00           NOP
A03F 00           NOP
A040 00           NOP
A041 00           NOP
A042 00           NOP
A043 00           NOP
A044 00           NOP
A045 00           NOP
A046 00           NOP
A047 00           NOP
A048 00           NOP
A049 00           NOP
A04A 00           NOP
A04B 00           NOP
A04C 00           NOP
A04D 00           NOP
A04E 00           NOP
A04F 00           NOP
A050 00           NOP
A051 00           NOP
A052 00           NOP
A053 00           NOP
A054 00           NOP
A055 00           NOP
A056 00           NOP
A057 00           NOP
A058 00           NOP
A059 00           NOP
A05A 00           NOP
A05B 00           NOP
A05C 00           NOP
A05D 00           NOP
A05E 00           NOP
A05F 00           NOP
A060 00           NOP
A061 00           NOP
A062 00           NOP
A063 00           NOP