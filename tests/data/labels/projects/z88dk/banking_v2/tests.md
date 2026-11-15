
| TEST     | ZSim | JNext                       | CSpect                      |
| -------- | ---- | --------------------------- | --------------------------- |
| asm 48   | OK   | OK                          | OK                          |
| asm 128  | OK   | OK but loops                | OK                          |
| asm Next | OK   | OK                          | OK                          |
| c 48     | OK   | OK                          | OK                          |
| c 128    | OK   | No far breakpoint and loops | No far breakpoint           |
| c Next   | OK   | OK                          | Only breaks in the first BP |
