int counter;

static int helper(void)
{
    return counter + 1;
}

void loop(void)
{
    counter = helper();
}
