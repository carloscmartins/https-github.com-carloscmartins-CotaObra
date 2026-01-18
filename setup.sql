
-- Script de configuração inicial e atualizações geográficas

-- 1. Garante que a extensão PostGIS esteja ativa
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Upsert do Depósito do Zé com coordenadas de alta precisão
-- Endereço Real: Rua Guaipá, 1500 - Vila Leopoldina, São Paulo - SP
-- Latitude: -23.522204 | Longitude: -46.732731
DELETE FROM stores WHERE name ILIKE '%Zé%' OR id = 's2-ze';

INSERT INTO stores (id, name, whatsapp, address, location, delivery_radius_km)
VALUES (
  's2-ze', 
  'Depósito do Zé', 
  '5511961553359', 
  'Rua Guaipá, 1500 - Vila Leopoldina, São Paulo - SP', 
  ST_SetSRID(ST_Point(-46.732731, -23.522204), 4326),
  50
);
