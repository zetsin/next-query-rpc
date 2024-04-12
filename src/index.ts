import {
  MutationFunction,
  UseMutationOptions,
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import { get, isFunction, mapValues } from "lodash";

type Leaves<T> = T extends object
  ? {
      [K in keyof T]: `${Exclude<K, symbol>}${Leaves<T[K]> extends never ? "" : `.${Leaves<T[K]>}`}`;
    }[keyof T]
  : never;

type Procedure = MutationFunction<any, any>;
type Procedures = { [Key: string]: Procedure | Procedures };

type Client<T> = {
  [k in keyof T]: T[k] extends Procedure
    ? {
        key: k;
        call: T[k];
        useQuery: (
          variables?: Parameters<T[k]>[number],
          options?: Omit<
            UseQueryOptions<ReturnType<T[k]>>,
            "queryKey" | "queryFn"
          >,
        ) => UseQueryResult<Awaited<ReturnType<T[k]>>, Error>;
        useMutation: (
          options?: Omit<
            UseMutationOptions<
              ReturnType<T[k]>,
              Error,
              Parameters<T[k]>[number]
            >,
            "mutationFn"
          >,
        ) => UseMutationResult<
          Awaited<ReturnType<T[k]>>,
          Error,
          Parameters<T[k]>[number]
        >;
      }
    : Client<T[k]>;
};

type ClientOptions = {
  parent?: string;
  fetchFn?: Procedure;
};

const createClient = <T extends Procedures>(
  procedures?: T,
  options?: ClientOptions,
): Client<T> => {
  const { parent, fetchFn } = options ?? {};

  return mapValues(procedures, (value, key) => {
    if (isFunction(value)) {
      const call: Procedure = async (variables) => {
        return fetchFn?.({
          procedure: [parent, key].filter(Boolean).join("."),
          variables,
        });
      };

      return {
        key,
        call,
        useQuery: (variables, options) => {
          return useQuery({
            ...options,
            queryKey: [key, variables],
            queryFn: () => call(variables),
          });
        },
        useMutation: (options) => {
          return useMutation({
            ...options,
            mutationFn: call,
          });
        },
      };
    } else {
      return createClient(value, {
        ...options,
        parent: key,
      });
    }
  }) as Client<T>;
};

const createRouter = <T extends Procedures>(procedures?: T) => {
  return async ({
    procedure,
    variables,
  }: {
    procedure: Leaves<T>;
    variables?: T[keyof T] extends Procedure ? Parameters<T[keyof T]> : unknown;
  }) => {
    const call = get(procedures, procedure);

    if (!isFunction(call)) {
      return null;
    }

    const result = await call(variables ?? {});
    return result ?? null;
  };
};

export const createRPC = <T extends Procedures>(
  procedures?: T,
  options?: Omit<ClientOptions, "parent">,
) => {
  return {
    client: createClient(procedures, options),
    router: createRouter(procedures),
  };
};
