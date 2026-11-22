-- Stop order writes while migrating. This rebuild calculates historical delivered quantities.
UPDATE products p
LEFT JOIN (
  SELECT o.storeId, item.productId, SUM(item.quantity) AS sold
  FROM customer_orders o
  JOIN JSON_TABLE(o.itemSnapshots, '$[*]' COLUMNS (
    productId INT PATH '$.productId', quantity INT PATH '$.quantity'
  )) item ON item.quantity > 0
  WHERE o.status = 'DELIVERED'
  GROUP BY o.storeId, item.productId
) history ON history.storeId = p.store_id AND history.productId = p.product_id
SET p.sold_quantity = COALESCE(history.sold, 0);
