#include "factorial.h"

int factorial(int n) __banked {
    if (n <= 1)
        return 1;
    return n * factorial(n - 1);
}
