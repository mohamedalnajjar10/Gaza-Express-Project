import { Link } from 'react-router-dom';
import { getCart, replaceCart } from './cart-api';
import { Empty, Result, Title } from '../../shared/ui/feedback';
import { ActionForm, Field } from '../../shared/ui/form';
import { useResource } from '../../shared/hooks/use-resource';

export default function CartPage() {
  const cart = useResource(async signal => {
    const cart = await getCart(signal);
    return {
      cart,
      products: new Map((cart.products ?? []).map(p => [p.productId, p])),
    };
  }, 'cart');
  return (
    <>
      <Title label="سلّتك" detail="راجع المنتجات والكميات قبل المتابعة." />
      <Result state={cart}>
        {({ cart: value, products }) =>
          value.items.length ? (
            <div className="stack">
              {value.items.map((item, index) => (
                <div
                  className="surface padded"
                  key={`${item.productId}-${item.optionIds.join(',')}`}
                >
                  <h2>
                    {products.get(item.productId)?.nameAr ??
                      `منتج غير متاح #${item.productId}`}
                  </h2>
                  <p>
                    الكمية: {item.quantity}
                    {item.optionIds.length
                      ? ` · ${item.optionIds.length} إضافة`
                      : ''}
                  </p>
                  <ActionForm
                    label="حفظ الكمية"
                    submit={async data => {
                      try {
                        await replaceCart(
                          value.version,
                          value.items.map((line, i) =>
                            i === index
                              ? {
                                  ...line,
                                  quantity: Number(data.get('quantity')),
                                }
                              : line,
                          ),
                        );
                      } finally {
                        cart.reload();
                      }
                    }}
                  >
                    <Field
                      label="الكمية"
                      name="quantity"
                      type="number"
                      min={1}
                      max={99}
                      defaultValue={String(item.quantity)}
                    />
                  </ActionForm>
                  <ActionForm
                    label="إزالة المنتج"
                    submit={async () => {
                      try {
                        await replaceCart(
                          value.version,
                          value.items.filter((_, i) => i !== index),
                        );
                      } finally {
                        cart.reload();
                      }
                    }}
                  />
                </div>
              ))}
              <Link className="button" to="/checkout">
                المتابعة إلى الدفع
              </Link>
              <ActionForm
                label="إفراغ السلة"
                submit={async () => {
                  try {
                    await replaceCart(value.version, []);
                  } finally {
                    cart.reload();
                  }
                }}
              />
            </div>
          ) : (
            <Empty title="سلّتك فارغة">
              <Link className="button" to="/">
                تصفّح المتاجر
              </Link>
            </Empty>
          )
        }
      </Result>
    </>
  );
}
