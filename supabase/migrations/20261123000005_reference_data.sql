-- ════════════════════════════════════════════════════════════════════════
-- PartnerBridge — reference data (taxonomy, plans, platform settings, templates)
-- Editable later from the admin panel.
-- ════════════════════════════════════════════════════════════════════════

-- ─── Industries (top level) ─────────────────────────────────────────────
insert into public.industries (name, slug, sort_order) values
  ('Information Technology', 'information-technology', 1),
  ('Marketing & Advertising', 'marketing-advertising', 2),
  ('Manufacturing', 'manufacturing', 3),
  ('Food & Beverage', 'food-beverage', 4),
  ('Logistics & Supply Chain', 'logistics-supply-chain', 5),
  ('Wholesale & Distribution', 'wholesale-distribution', 6),
  ('Retail & E-commerce', 'retail-ecommerce', 7),
  ('Travel & Hospitality', 'travel-hospitality', 8),
  ('Real Estate & Construction', 'real-estate-construction', 9),
  ('Interior Design & Architecture', 'interior-design-architecture', 10),
  ('Healthcare & Life Sciences', 'healthcare-life-sciences', 11),
  ('Financial Services', 'financial-services', 12),
  ('Education & Training', 'education-training', 13),
  ('Energy & Utilities', 'energy-utilities', 14),
  ('Agriculture', 'agriculture', 15),
  ('Professional Services', 'professional-services', 16),
  ('Media & Entertainment', 'media-entertainment', 17),
  ('Automotive', 'automotive', 18)
on conflict (slug) do nothing;

-- ─── Sub-industries ─────────────────────────────────────────────────────
insert into public.industries (parent_id, name, slug, sort_order)
select p.id, s.name, s.slug, s.ord
from (values
  ('information-technology', 'Web & App Development', 'web-app-development', 1),
  ('information-technology', 'SaaS', 'saas', 2),
  ('information-technology', 'IT Services & Consulting', 'it-services-consulting', 3),
  ('information-technology', 'Cybersecurity', 'cybersecurity', 4),
  ('information-technology', 'Cloud & Infrastructure', 'cloud-infrastructure', 5),
  ('information-technology', 'Data & AI', 'data-ai', 6),
  ('marketing-advertising', 'Digital Marketing', 'digital-marketing', 1),
  ('marketing-advertising', 'Branding & Creative', 'branding-creative', 2),
  ('marketing-advertising', 'Performance Marketing', 'performance-marketing', 3),
  ('marketing-advertising', 'Public Relations', 'public-relations', 4),
  ('manufacturing', 'Electronics Manufacturing', 'electronics-manufacturing', 1),
  ('manufacturing', 'Textiles & Apparel', 'textiles-apparel', 2),
  ('manufacturing', 'Industrial Equipment', 'industrial-equipment', 3),
  ('manufacturing', 'Packaging', 'packaging', 4),
  ('food-beverage', 'Packaged Foods', 'packaged-foods', 1),
  ('food-beverage', 'Organic & Natural Foods', 'organic-natural-foods', 2),
  ('food-beverage', 'Beverages', 'beverages', 3),
  ('logistics-supply-chain', 'Freight & Trucking', 'freight-trucking', 1),
  ('logistics-supply-chain', 'Warehousing', 'warehousing', 2),
  ('logistics-supply-chain', 'Last-mile Delivery', 'last-mile-delivery', 3),
  ('wholesale-distribution', 'FMCG Distribution', 'fmcg-distribution', 1),
  ('wholesale-distribution', 'Electronics Distribution', 'electronics-distribution', 2),
  ('travel-hospitality', 'Tour Operators', 'tour-operators', 1),
  ('travel-hospitality', 'Corporate Travel', 'corporate-travel', 2),
  ('travel-hospitality', 'Hotels & Resorts', 'hotels-resorts', 3),
  ('interior-design-architecture', 'Residential Interiors', 'residential-interiors', 1),
  ('interior-design-architecture', 'Commercial Interiors', 'commercial-interiors', 2),
  ('retail-ecommerce', 'D2C Brands', 'd2c-brands', 1),
  ('retail-ecommerce', 'Marketplaces', 'marketplaces', 2),
  ('professional-services', 'Legal Services', 'legal-services', 1),
  ('professional-services', 'Accounting & Tax', 'accounting-tax', 2),
  ('healthcare-life-sciences', 'Medical Devices', 'medical-devices', 1),
  ('financial-services', 'Fintech', 'fintech', 1)
) as s (parent_slug, name, slug, ord)
join public.industries p on p.slug = s.parent_slug
on conflict (slug) do nothing;

-- ─── Partnership categories ─────────────────────────────────────────────
insert into public.partnership_categories (name, slug, description, icon, sort_order) values
  ('Distributor', 'distributor', 'Buy, stock and distribute products within a territory or channel.', 'Truck', 1),
  ('Reseller', 'reseller', 'Resell products or services under the original brand.', 'Store', 2),
  ('Referral', 'referral', 'Refer qualified leads in exchange for a fee or reciprocity.', 'Share2', 3),
  ('Affiliate', 'affiliate', 'Promote offerings and earn performance-based commissions.', 'BadgePercent', 4),
  ('Technology', 'technology', 'Combine technology capabilities to build or deliver solutions.', 'Cpu', 5),
  ('Integration', 'integration', 'Connect products through APIs and technical integrations.', 'Plug', 6),
  ('Marketing', 'marketing', 'Co-marketing campaigns, events and content collaborations.', 'Megaphone', 7),
  ('Strategic Alliance', 'strategic-alliance', 'Long-term alignment on shared strategic goals.', 'Handshake', 8),
  ('Manufacturing', 'manufacturing', 'Contract, private-label or co-manufacturing arrangements.', 'Factory', 9),
  ('Supply Chain', 'supply-chain', 'Sourcing, logistics and fulfilment partnerships.', 'Boxes', 10),
  ('Joint Venture', 'joint-venture', 'Create a jointly owned venture or project entity.', 'GitMerge', 11),
  ('White-label', 'white-label', 'Rebrand and sell another company''s product as your own.', 'Tag', 12),
  ('Franchise', 'franchise', 'License a proven business model and brand.', 'Building2', 13),
  ('Other', 'other', 'Any other form of business collaboration.', 'Sparkles', 14)
on conflict (slug) do nothing;

-- ─── Subscription plans (proposed launch prices, not validated market prices) ──
insert into public.subscription_plans
  (code, name, tagline, price_monthly, price_yearly, is_custom_pricing, trial_days, sort_order, limits, features)
values
  ('free', 'Free Explorer', 'Get discovered and explore the marketplace', 0, 0, false, 0, 1,
   '{"partnership_requests_per_month": 5, "applications_per_month": 3, "active_opportunities": 1,
     "team_members": 2, "active_workspaces": 2, "storage_mb": 100, "recommendations": 3,
     "advanced_filters": 0, "advanced_analytics": 0, "exports": 0, "enhanced_visibility": 0}',
   array['One company profile', 'Basic company discovery', '5 partnership requests / month',
         '3 opportunity applications / month', 'Basic messaging', 'Basic analytics']),
  ('growth', 'Growth', 'For companies actively building partnerships', 999, 9990, false, 14, 2,
   '{"partnership_requests_per_month": 30, "applications_per_month": 20, "active_opportunities": 5,
     "team_members": 3, "active_workspaces": 10, "storage_mb": 2048, "recommendations": 25,
     "advanced_filters": 1, "advanced_analytics": 1, "exports": 0, "enhanced_visibility": 1}',
   array['Enhanced company visibility', '30 partnership requests / month', 'Advanced company filters',
         '5 active opportunities', 'Smart partner recommendations', 'Advanced analytics',
         '2 GB document storage', 'Priority notifications']),
  ('business', 'Business', 'For teams managing a partner portfolio', 2499, 24990, false, 14, 3,
   '{"partnership_requests_per_month": 100, "applications_per_month": 60, "active_opportunities": 15,
     "team_members": 15, "active_workspaces": 50, "storage_mb": 10240, "recommendations": 50,
     "advanced_filters": 1, "advanced_analytics": 1, "exports": 1, "enhanced_visibility": 1}',
   array['Up to 15 team members', 'Advanced partnership management', '50 active workspaces',
         'Advanced reports', 'PDF, CSV & Excel exports', 'Enhanced company profile',
         '15 active opportunities', 'Collaboration tools']),
  ('enterprise', 'Enterprise', 'Custom limits, permissions and integrations', 0, 0, true, 0, 4,
   '{"partnership_requests_per_month": -1, "applications_per_month": -1, "active_opportunities": -1,
     "team_members": -1, "active_workspaces": -1, "storage_mb": -1, "recommendations": -1,
     "advanced_filters": 1, "advanced_analytics": 1, "exports": 1, "enhanced_visibility": 1}',
   array['Custom user limits', 'Advanced permissions', 'API access', 'Organization-level reporting',
         'Priority support', 'Custom integrations'])
on conflict (code) do nothing;

-- ─── Platform settings ──────────────────────────────────────────────────
insert into public.platform_settings (key, value, description) values
  ('matching_weights',
   '{"industry": 15, "complementary_services": 20, "partnership_type": 25, "objectives": 10,
     "geography": 10, "company_size": 5, "target_market": 10, "capabilities": 5}',
   'Weights (points) used by the rule-based partner matching engine. Normalized to 100.'),
  ('request_expiry_days', '30', 'Days after which unanswered partnership requests expire.'),
  ('rate_limits',
   '{"partnership_requests_per_hour": 10, "messages_per_minute": 30, "applications_per_hour": 10,
     "auth_per_10_minutes": 10, "contact_per_hour": 5, "reports_per_hour": 10}',
   'Server-side rate limits per user/IP.'),
  ('maintenance_mode', 'false', 'When true, the public site shows a maintenance banner.'),
  ('allow_new_registrations', 'true', 'Disable to pause new company sign-ups.')
on conflict (key) do nothing;

-- ─── Email templates ({{placeholders}} are replaced server-side) ───────
insert into public.email_templates (key, subject, body, description) values
  ('notification', '{{title}}',
   E'Hi {{name}},\n\n{{body}}\n\nOpen PartnerBridge: {{link}}\n\nYou can change notification preferences in Settings → Notifications.',
   'Generic notification email'),
  ('invitation', 'You have been invited to join {{company}} on PartnerBridge',
   E'Hi,\n\n{{inviter}} invited you to join {{company}} on PartnerBridge as {{role}}.\n\nAccept the invitation: {{link}}\n\nThis link expires in 7 days.',
   'Team invitation'),
  ('verification_update', 'Verification update for {{company}}',
   E'Hi {{name}},\n\nThe verification status of {{company}} is now: {{status}}.\n\n{{notes}}\n\n{{link}}',
   'Verification decision'),
  ('subscription_renewal', 'Your {{plan}} plan renews on {{date}}',
   E'Hi {{name}},\n\nYour {{plan}} subscription for {{company}} ends on {{date}}. Renew to keep your features: {{link}}',
   'Renewal reminder')
on conflict (key) do nothing;
