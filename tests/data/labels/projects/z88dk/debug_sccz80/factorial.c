#include "factorial.h"

#pragma codeseg PAGE_20_CODE

int factorial(int n) __banked
{
    if (n <= 1)
    {
        return 1;
    }
    return n * factorial(n - 1);
}
