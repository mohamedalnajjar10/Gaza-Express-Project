-- Duplicate active deliveries require explicit operator reconciliation before this update can succeed.
UPDATE customer_orders SET activeDriverId = driverId
WHERE status IN ('ASSIGNED', 'IN_TRANSIT') AND driverId IS NOT NULL AND activeDriverId IS NULL;
