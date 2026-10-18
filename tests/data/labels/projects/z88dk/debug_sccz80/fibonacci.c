#include "fibonacci.h"

#pragma codeseg PAGE_22_CODE

int fibonacci(int n) __banked
{
    if (n <= 1)
    {
        return n;
    }
    return fibonacci(n - 1) + fibonacci(n - 2);
}