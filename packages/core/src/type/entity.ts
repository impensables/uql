import { QueryRaw, QueryRawFn, QueryRawFnOptions } from './query';
import { Scalar, Type } from './utility';

export type Key<E> = {
  readonly [K in keyof E]: K & string;
}[keyof E & string];

export type FieldKey<E> = {
  readonly [K in Key<E>]: E[K] extends Scalar ? K : never;
}[Key<E>];

export type FieldValue<E> = E[FieldKey<E>];

export type RelationKey<E> = {
  readonly [K in Key<E>]: E[K] extends Scalar ? never : K;
}[Key<E>];

export type RelationValue<E> = E[RelationKey<E>];

export type EntityOptions = {
  readonly name?: string;
  readonly softDelete?: boolean;
};

export type FieldOptions = {
  readonly name?: string;
  readonly isId?: true;
  readonly type?: any;
  readonly reference?: EntityGetter | ReferenceOptions;
  readonly virtual?: VirtualValue;
  readonly onInsert?: OnFieldCallback;
  readonly onUpdate?: OnFieldCallback;
  readonly onDelete?: OnFieldCallback;
};

export type OnFieldCallback = (opts?: QueryRawFnOptions) => Scalar | QueryRaw;

export type VirtualValue = Scalar | QueryRaw;

export type EntityGetter<E = any> = () => Type<E>;

export type ReferenceOptions<E = any> = { entity: EntityGetter<E> };

export type CascadeType = 'persist' | 'delete';

export type RelationOptions<E = any> = {
  entity?: EntityGetter<E>;
  readonly cardinality?: RelationCardinality;
  readonly cascade?: boolean | CascadeType;
  mappedBy?: RelationMappedBy<E>;
  through?: EntityGetter<RelationValue<E>>;
  references?: RelationReferences;
};

type RelationOptionsOwner<E> = Pick<RelationOptions<E>, 'entity' | 'references' | 'cascade'>;
type RelationOptionsInverseSide<E> = Pick<RelationOptions<E>, 'entity' | 'mappedBy' | 'cascade'>;
type RelationOptionsThroughOwner<E> = Pick<RelationOptions<E>, 'entity' | 'through' | 'references' | 'cascade'>;

export type KeyMap<E> = { readonly [K in Key<E>]: Key<E> };

export type KeyMapper<E> = (keyMap: KeyMap<E>) => Key<E>;

export type RelationReferences = { source: string; target: string }[];

export type RelationMappedBy<E> = E extends object ? Key<E> | KeyMapper<E> : Key<E>;

export type RelationCardinality = '11' | 'm1' | '1m' | 'mm';

export type RelationOneToOneOptions<E> = RelationOptionsOwner<E> | RelationOptionsInverseSide<E>;

export type RelationOneToManyOptions<E> = RelationOptionsOwner<E> | RelationOptionsInverseSide<E> | RelationOptionsThroughOwner<E>;

export type RelationManyToOneOptions<E> = RelationOptionsOwner<E> | RelationOptionsInverseSide<E>;

export type RelationManyToManyOptions<E> = RelationOptionsThroughOwner<E> | RelationOptionsInverseSide<E>;

export type EntityMeta<E> = {
  readonly entity: Type<E>;
  name: string;
  id?: FieldKey<E>;
  softDeleteKey?: FieldKey<E>;
  fields: {
    [K in FieldKey<E>]?: FieldOptions;
  };
  relations: {
    [K in RelationKey<E>]?: RelationOptions;
  };
  processed?: boolean;
};
