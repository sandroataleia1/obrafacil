<?php

namespace App\Enums;

enum CustomerKind: string
{
    case Individual = 'individual';
    case Company = 'company';
}
