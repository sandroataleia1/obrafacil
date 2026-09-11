<?php

namespace App\Http\Resources;

use App\Models\CatalogItem;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * §16/§32/§33: the same canonical shape for list, show, create, and
 * update responses — the entity is small enough that there's no separate
 * lean "list" variant (unlike Customer's List/full split). `company_id`
 * is never exposed (§32/§57). `cost_price`/`sale_price` come out already
 * as decimal strings ("18.50", "0.00", or null) — the model's `decimal:2`
 * cast, never a binary float (§16).
 *
 * @property CatalogItem $resource
 */
class CatalogItemResource extends JsonResource
{
    public static $wrap = null;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type->value,
            'code' => $this->code,
            'name' => $this->name,
            'category' => $this->category,
            'unit' => $this->unit,
            'description' => $this->description,
            'cost_price' => $this->cost_price,
            'sale_price' => $this->sale_price,
            'active' => $this->active,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
