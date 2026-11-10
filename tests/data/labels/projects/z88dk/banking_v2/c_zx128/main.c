extern int banked_fn(int a) __banked;

int main(void)
{
	int r = banked_fn(2);
	return r;
}
