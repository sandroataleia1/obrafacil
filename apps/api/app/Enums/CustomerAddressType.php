<?php

namespace App\Enums;

enum CustomerAddressType: string
{
    case Residential = 'residential';
    case Commercial = 'commercial';
    case WorkSite = 'work_site';
    case Billing = 'billing';
    case Delivery = 'delivery';
    case Other = 'other';
}
