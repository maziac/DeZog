#include "factorial.h"

int result;

int main(void) {
    result = factorial(5);
    result += util_add();
    return result;
}
